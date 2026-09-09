import type { Aula, Questao, Tema } from '@estudaai/shared';
import { AulaSchema } from '@estudaai/shared';
import { ErroGeracao, type GeradorIA } from './cliente.js';
import { somarCustos, type Custo } from './modelo.js';
import { deduplicar, intercalar, normalizarQuestao } from './normalizar.js';
import {
  AulaGeradaSchema,
  LoteFixacaoSchema,
  LoteProvaSchema,
  OutlineSchema,
} from './esquemas.js';
import { blocoMaterial, tarefaAula, tarefaFixacao, tarefaOutline, tarefaProva } from './prompts.js';
import { amostra, trechoRelevante } from '../material/texto.js';

/** Lotes maiores que isso saem com qualidade pior e arriscam estourar o teto de tokens. */
const MAX_POR_LOTE = 5;

/** Quanto do alvo precisa sobreviver a normalizacao para o tema valer a pena. */
const APROVEITAMENTO_MINIMO = 0.6;

function dividirEmLotes(total: number): number[] {
  const lotes: number[] = [];
  let restante = total;
  while (restante > 0) {
    const lote = Math.min(MAX_POR_LOTE, restante);
    lotes.push(lote);
    restante -= lote;
  }
  return lotes;
}

/** Resumo do que ja foi criado, para o lote seguinte nao repetir. */
function jaCriadas(questoes: Questao[]): string {
  return questoes
    .map((q) => {
      switch (q.tipo) {
        case 'mc':
        case 'calc':
        case 'cenario':
        case 'tf':
          return q.pergunta.slice(0, 70);
        case 'fill':
          return `${q.antes}___${q.depois}`.slice(0, 70);
        case 'match':
          return q.pares.map((p) => p[0]).join(', ').slice(0, 70);
        case 'ordenar':
          return q.instrucao.slice(0, 70);
      }
    })
    .join(' | ');
}

export type MapeamentoMaterial = {
  nome: string;
  temas: { nome: string; conceito: string; chave: string[] }[];
  custo: Custo;
};

/** Le o documento inteiro e propoe a materia e seus temas. */
export async function mapearMaterial(
  gerador: GeradorIA,
  blocos: string[],
): Promise<MapeamentoMaterial> {
  const { dados, custo } = await gerador.gerar({
    material: blocoMaterial(amostra(blocos)),
    tarefa: tarefaOutline(),
    esquema: OutlineSchema,
    nomeEsquema: 'mapa_do_material',
    maxTokens: 2000,
    esforco: 'medium',
  });

  const temas = dados.temas
    .filter((t) => t.nome.trim().length > 0)
    .slice(0, 6)
    .map((t) => ({
      nome: t.nome.trim(),
      conceito: t.conceito.trim(),
      chave: t.chave.map((c) => c.trim()).filter(Boolean).slice(0, 5),
    }));

  if (temas.length === 0) {
    throw new ErroGeracao('Nao consegui identificar temas nesse material.');
  }

  return { nome: dados.nome.trim() || 'Minha materia', temas, custo };
}

export type TrilhaGerada = {
  aula: Aula | null;
  questoes: Questao[];
  custo: Custo;
  /** Quantas questoes a IA devolveu mas foram descartadas por virem quebradas. */
  descartadas: number;
};

/**
 * Gera a trilha completa de um tema: aula + questoes.
 *
 * As tres frentes (aula, prova, fixacao) saem em PARALELO, e dentro de cada
 * familia os lotes vao em serie, porque o segundo lote precisa saber o que o
 * primeiro criou para nao repetir.
 *
 * O cache do material e por familia, nao do tema inteiro: o esquema do
 * structured output entra no prefixo antes do system, entao chamadas com
 * esquemas diferentes nunca compartilham cache (medido em 08/09/2026 — as tres
 * frentes escreveram tres entradas de tamanhos diferentes). Por isso o material
 * so e marcado para cache quando a familia tem mais de um lote para ler de volta.
 */
export async function gerarTrilha(
  gerador: GeradorIA,
  blocos: string[],
  tema: Pick<Tema, 'nome' | 'chave'>,
  alvoQuestoes: number,
): Promise<TrilhaGerada> {
  const material = blocoMaterial(trechoRelevante(blocos, tema));
  const custos: Custo[] = [];
  // Falha de lote nao derruba o tema, mas nao pode sumir: se no fim sobrou
  // pouca coisa, e ela que explica o porque.
  const falhas: unknown[] = [];

  const rodarAula = async (): Promise<Aula | null> => {
    try {
      const r = await gerador.gerar({
        material,
        tarefa: tarefaAula(tema.nome),
        esquema: AulaGeradaSchema,
        nomeEsquema: 'aula',
        maxTokens: 3000,
        esforco: 'medium',
      });
      custos.push(r.custo);
      const validada = AulaSchema.safeParse(r.dados);
      return validada.success ? validada.data : null;
    } catch (erro) {
      // Tema sem aula ainda e jogavel; o cliente cai direto no conceito curto.
      falhas.push(erro);
      return null;
    }
  };

  // Metade prova, metade fixacao, em lotes.
  const alvoProva = Math.ceil(alvoQuestoes / 2);
  const alvoFixacao = alvoQuestoes - alvoProva;

  let brutasProva = 0;
  let brutasFixacao = 0;

  const rodarProva = async (): Promise<Questao[]> => {
    const saida: Questao[] = [];
    const lotes = dividirEmLotes(alvoProva);
    for (const quantas of lotes) {
      try {
        const r = await gerador.gerar({
          material,
          tarefa: tarefaProva(tema.nome, quantas, saida.length ? jaCriadas(saida) : undefined),
          esquema: LoteProvaSchema,
          nomeEsquema: 'questoes_de_prova',
          maxTokens: 4000,
          esforco: 'medium',
          cachearMaterial: lotes.length > 1,
        });
        custos.push(r.custo);
        brutasProva += r.dados.questoes.length;
        for (const bruta of r.dados.questoes) {
          const q = normalizarQuestao(bruta, 'prova');
          if (q) saida.push(q);
        }
      } catch (erro) {
        // Um lote perdido nao invalida os outros.
        falhas.push(erro);
      }
    }
    return saida;
  };

  const rodarFixacao = async (): Promise<Questao[]> => {
    const saida: Questao[] = [];
    const lotes = dividirEmLotes(alvoFixacao);
    for (const quantas of lotes) {
      try {
        const r = await gerador.gerar({
          material,
          tarefa: tarefaFixacao(tema.nome, quantas, saida.length ? jaCriadas(saida) : undefined),
          esquema: LoteFixacaoSchema,
          nomeEsquema: 'exercicios_de_fixacao',
          maxTokens: 3000,
          esforco: 'low',
          cachearMaterial: lotes.length > 1,
        });
        custos.push(r.custo);
        brutasFixacao += r.dados.questoes.length;
        for (const bruta of r.dados.questoes) {
          const q = normalizarQuestao(bruta, 'fixacao');
          if (q) saida.push(q);
        }
      } catch (erro) {
        // Idem.
        falhas.push(erro);
      }
    }
    return saida;
  };

  const [aula, prova, fixacao] = await Promise.all([
    rodarAula(),
    rodarProva(),
    rodarFixacao(),
  ]);

  const questoes = intercalar(deduplicar([...prova, ...fixacao]));
  const custo = somarCustos(custos);
  const descartadas = brutasProva + brutasFixacao - questoes.length;

  if (questoes.length < Math.ceil(alvoQuestoes * APROVEITAMENTO_MINIMO)) {
    // Se houve falha de chamada, a causa dela e mais util do que a contagem:
    // "sem credito" e "a IA devolveu questao quebrada" pedem acoes diferentes.
    if (falhas.length > 0) throw falhas[0];
    throw new ErroGeracao(
      `A IA so produziu ${questoes.length} questoes utilizaveis de ${alvoQuestoes}. Tente de novo.`,
    );
  }

  return { aula, questoes, custo, descartadas: Math.max(0, descartadas) };
}
