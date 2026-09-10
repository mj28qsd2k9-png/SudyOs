import { z } from 'zod';
import { diasEntre } from './ofensiva.js';

/**
 * Revisao espacada — a parte do Duolingo que faz o erro virar estudo.
 *
 * O modelo publico deles estima a "meia-vida" de cada item e agenda a volta
 * para quando a chance de lembrar cai perto de 50%. Isso e regressao treinada
 * em milhoes de alunos. Nao temos essa populacao, e fingir que temos daria
 * ruido com nome bonito — entao aqui e SM-2 enxuto: **o intervalo dobra a cada
 * acerto e volta ao inicio a cada erro**. A regra simples e a honesta.
 *
 * Duas decisoes de produto moram nesta regra:
 *
 * - **So questao errada entra no baralho.** Acertou de primeira, nao vira
 *   carta. O baralho e a lista dos seus erros, nao um arquivo de tudo o que
 *   voce ja respondeu — e um baralho que inclui tudo ninguem termina.
 * - **Errou hoje, revisa hoje.** A carta nova vence no mesmo dia, entao ao sair
 *   de um tema o aluno ja pode refazer o que errou, enquanto a explicacao ainda
 *   esta fresca. E o "Mistakes" do Duolingo.
 *
 * Nada aqui toca a rede, e a data nunca vem do cliente: quem passa `hoje` e o
 * servidor, no fuso do aluno, pelo mesmo motivo da ofensiva.
 */

/** Teto do intervalo. Sem teto, dois anos sem ver a carta nao e revisao. */
export const INTERVALO_MAXIMO_DIAS = 60;

export const RevisaoSchema = z.object({
  questaoId: z.string().min(1),
  materiaId: z.string().min(1),
  temaId: z.string().min(1),
  /** Conceitos que a questao cobra, para o app dizer o que anda falhando. */
  tags: z.array(z.string()).default([]),
  /** Quantas vezes seguidas o aluno acertou depois do ultimo erro. */
  acertosSeguidos: z.number().int().min(0).default(0),
  /** Quantas vezes errou esta questao, somando tudo. */
  erros: z.number().int().min(0).default(0),
  /** Espera atual, em dias. */
  intervaloDias: z.number().int().min(0).default(0),
  /** Dia local (YYYY-MM-DD) em que a carta volta. */
  proximaEm: z.string().min(1),
  /** Dia local da ultima resposta. */
  ultimaEm: z.string().min(1),
});

export type Revisao = z.infer<typeof RevisaoSchema>;

/** Soma dias a um dia local YYYY-MM-DD, devolvendo outro dia local. */
export function somarDias(dia: string, dias: number): string {
  const base = Date.parse(`${dia}T00:00:00Z`);
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

export type Cartao = Pick<Revisao, 'acertosSeguidos' | 'erros' | 'intervaloDias'>;

/**
 * O agendamento em si.
 *
 * `atual` e `null` quando a questao nunca entrou no baralho. Nesse caso, acerto
 * nao cria carta nenhuma — so o erro abre ficha.
 */
export function agendar(
  atual: Cartao | null,
  acertou: boolean,
  hoje: string,
): (Cartao & { proximaEm: string; ultimaEm: string }) | null {
  if (!acertou) {
    return {
      acertosSeguidos: 0,
      erros: (atual?.erros ?? 0) + 1,
      intervaloDias: 0,
      // Vence hoje: dá para refazer na sequencia, com a explicacao fresca.
      proximaEm: hoje,
      ultimaEm: hoje,
    };
  }

  if (!atual) return null;

  // 0 -> 1 -> 2 -> 4 -> 8 ... ate o teto.
  const intervalo = Math.min(
    atual.intervaloDias === 0 ? 1 : atual.intervaloDias * 2,
    INTERVALO_MAXIMO_DIAS,
  );

  return {
    acertosSeguidos: atual.acertosSeguidos + 1,
    erros: atual.erros,
    intervaloDias: intervalo,
    proximaEm: somarDias(hoje, intervalo),
    ultimaEm: hoje,
  };
}

/** `true` quando a carta ja pode voltar. */
export function venceu(revisao: Pick<Revisao, 'proximaEm'>, hoje: string): boolean {
  return diasEntre(revisao.proximaEm, hoje) >= 0;
}

/**
 * Ordem em que as cartas vencidas voltam.
 *
 * Primeiro as mais atrasadas, e no empate a que o aluno mais errou. Errar cinco
 * vezes a mesma coisa e o sinal mais forte que ele da de onde precisa de ajuda.
 */
export function ordenarVencidas(revisoes: Revisao[], hoje: string): Revisao[] {
  return revisoes
    .filter((r) => venceu(r, hoje))
    .sort((a, b) => {
      const atraso = diasEntre(a.proximaEm, hoje) - diasEntre(b.proximaEm, hoje);
      if (atraso !== 0) return -atraso;
      return b.erros - a.erros;
    });
}

/**
 * Os conceitos que mais aparecem no baralho.
 *
 * E o "onde voce pode melhorar": nao a lista de questoes, e o assunto por tras
 * delas. Uma questao errada e azar; o mesmo conceito errado tres vezes e um
 * buraco no estudo.
 */
export function conceitosFracos(revisoes: Revisao[], quantos = 5): { tag: string; erros: number }[] {
  const soma = new Map<string, number>();
  for (const r of revisoes) {
    for (const tag of r.tags) {
      soma.set(tag, (soma.get(tag) ?? 0) + r.erros);
    }
  }
  return [...soma.entries()]
    .map(([tag, erros]) => ({ tag, erros }))
    .sort((a, b) => b.erros - a.erros || a.tag.localeCompare(b.tag))
    .slice(0, quantos);
}
