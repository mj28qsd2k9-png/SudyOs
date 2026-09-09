import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { MateriaSchema, temasRestantes, type Materia } from '@estudaai/shared';
import { ErroGeracao, type GeradorIA } from '../ia/cliente.js';
import { descreverErro } from '../ia/erros.js';
import { gerarTrilha, mapearMaterial } from '../ia/gerar.js';
import {
  fatiar,
  MAX_CARACTERES_MATERIAL,
  MIN_CARACTERES_MATERIAL,
  normalizarMaterial,
} from '../material/texto.js';
import { ErroPdf, extrairTextoDoPdf, MAX_BYTES_PDF } from '../material/pdf.js';
import { comTemaGerado, type Repositorio } from '../infra/repositorio.js';
import { executarTarefa, type FalhaTarefa, type Fila } from '../dominio/tarefas.js';
import { identificar } from './contexto.js';

/**
 * O material pode chegar de dois jeitos: o PDF em si (o que o app faz) ou o
 * texto ja extraido (o que o banco de testes e os scripts fazem). Os dois
 * desembocam no mesmo lugar.
 */
type MaterialRecebido = {
  texto: string;
  nome?: string;
  paginas?: number;
  paginasLidas?: number;
};

async function lerMaterial(req: FastifyRequest): Promise<MaterialRecebido> {
  if (req.isMultipart()) {
    const arquivo = await req.file({ limits: { fileSize: MAX_BYTES_PDF } });
    if (!arquivo) throw new ErroPdf('Nenhum arquivo enviado.', 'nao_e_pdf');
    const dados = new Uint8Array(await arquivo.toBuffer());
    const extraido = await extrairTextoDoPdf(dados);
    return {
      texto: extraido.texto,
      nome: arquivo.filename?.replace(/\.pdf$/i, '').trim() || undefined,
      paginas: extraido.paginas,
      paginasLidas: extraido.paginasLidas,
    };
  }

  const corpo = CorpoNovaMateria.safeParse(req.body);
  if (!corpo.success) {
    throw new ErroCorpo('Envie um PDF (multipart) ou { texto } em JSON.', corpo.error.issues);
  }
  return { texto: corpo.data.texto, nome: corpo.data.nome };
}

class ErroCorpo extends Error {
  constructor(
    message: string,
    readonly detalhe?: unknown,
  ) {
    super(message);
    this.name = 'ErroCorpo';
  }
}

const CorpoNovaMateria = z.object({
  /**
   * Texto do PDF. A extracao roda no cliente (pdf.js): evita subir o arquivo
   * inteiro e mantem o backend sem parser de PDF.
   */
  texto: z.string(),
  nome: z.string().trim().max(120).optional(),
});

const PALETA = ['#E8501A', '#2FA36B', '#3BA9E0', '#FF7A45', '#B83C10'];

/**
 * Nome de arquivo generico nao diz nada ao aluno. "apostila.pdf", "scan_02.pdf"
 * e "Documento (1).pdf" perdem para o nome que a IA leu do conteudo.
 */
const NOMES_GENERICOS =
  // `\b` nao serve aqui: `_` conta como caractere de palavra, entao "scan_02"
  // nao teria fronteira depois de "scan". A checagem e "nao vem outra letra".
  /^(apostila|material|documento|document|aula|slides?|resumo|texto|arquivo|scanner|scan|digitalizado|untitled|sem[\s_-]?titulo|doc|pdf|download|file|img|imagem|new)(?![a-z])/i;

function nomeDaMateria(doArquivo: string | undefined, daIA: string): string {
  const arquivo = doArquivo?.trim();
  if (!arquivo) return daIA;
  if (NOMES_GENERICOS.test(arquivo)) return daIA;
  // "20240513_1032" e afins: numero nao e nome de materia.
  if (!/[a-z]{3}/i.test(arquivo)) return daIA;
  return arquivo;
}

export type DependenciasRotas = {
  repo: Repositorio;
  gerador: GeradorIA;
  fila: Fila;
  /**
   * Em serverless a instancia pode ser congelada assim que a resposta sai. A
   * plataforma precisa de uma promessa para segurar ate a geracao terminar.
   */
  segurar?: (promessa: Promise<unknown>) => void;
  questoesPorTema: number;
};

export async function rotasMaterias(app: FastifyInstance, deps: DependenciasRotas) {
  const { repo, gerador, fila, segurar, questoesPorTema } = deps;

  app.get('/tarefas/:tarefaId', async (req, reply) => {
    const { usuarioId } = identificar(req);
    const { tarefaId } = req.params as { tarefaId: string };
    const tarefa = await fila.obter(tarefaId, usuarioId);
    if (!tarefa) return reply.code(404).send({ erro: 'Tarefa nao encontrada.' });
    return tarefa;
  });

  app.get('/materias', async (req) => {
    const { usuarioId } = identificar(req);
    return { materias: await repo.listarMaterias(usuarioId) };
  });

  app.get('/materias/:materiaId', async (req, reply) => {
    const { usuarioId } = identificar(req);
    const { materiaId } = req.params as { materiaId: string };
    const materia = await repo.obterMateria(usuarioId, materiaId);
    if (!materia) return reply.code(404).send({ erro: 'Materia nao encontrada.' });
    return { materia };
  });

  /**
   * Sobe um material novo: mapeia os temas e ja gera a trilha do primeiro.
   *
   * Gerar o primeiro tema aqui e o que faz a espera valer a pena — o aluno sai
   * da tela de upload direto para uma aula, em vez de cair numa lista de temas
   * trancados. Os demais temas ele gera quando quiser, gastando cota.
   */
  app.post('/materias', async (req, reply) => {
    const { usuarioId, fuso } = identificar(req);

    let recebido: MaterialRecebido;
    try {
      recebido = await lerMaterial(req);
    } catch (erro) {
      if (erro instanceof ErroPdf) {
        req.log.warn({ codigo: erro.codigo }, erro.message);
        return reply
          .code(erro.codigo === 'pdf_grande' ? 413 : 422)
          .send({ erro: erro.message, codigo: erro.codigo, adiantaTentarDeNovo: false });
      }
      if (erro instanceof ErroCorpo) {
        return reply.code(400).send({ erro: erro.message, detalhe: erro.detalhe });
      }
      throw erro;
    }

    const texto = normalizarMaterial(recebido.texto);
    if (texto.length < MIN_CARACTERES_MATERIAL) {
      return reply.code(422).send({
        erro:
          'Esse material tem pouco texto (pode ser um PDF escaneado). ' +
          'Preciso de um PDF com texto de verdade.',
        codigo: 'pdf_sem_texto',
        adiantaTentarDeNovo: false,
      });
    }
    if (texto.length > MAX_CARACTERES_MATERIAL) {
      return reply
        .code(413)
        .send({ erro: 'Material grande demais. Divida em partes menores.', codigo: 'material_grande' });
    }

    const usuario = await repo.obterUsuario(usuarioId, fuso);
    if (temasRestantes(usuario.plano, usuario.cota.questoesUsadas) < 1) {
      return reply.code(402).send({ erro: 'Cota do mes esgotada.', cota: usuario.cota });
    }

    const blocos = fatiar(texto);

    // Cortar em silencio e o pior dos mundos: o aluno acha que a materia
    // inteira virou tema e nunca descobre que metade do livro ficou de fora.
    const aviso =
      recebido.paginas && recebido.paginasLidas && recebido.paginasLidas < recebido.paginas
        ? `Li as primeiras ${recebido.paginasLidas} de ${recebido.paginas} páginas. ` +
          'Para cobrir o resto, divida o PDF e suba as outras partes como matérias separadas.'
        : undefined;

    const tarefa = await fila.criar(usuarioId, 'Destrinchando o material...');

    executarTarefa(
      fila,
      tarefa.id,
      async () => {
        void fila.andar(tarefa.id, 'Mapeando os temas...', 0.15);
        const mapa = await mapearMaterial(gerador, blocos);

        const materiaId = randomUUID();
        const materia: Materia = MateriaSchema.parse({
          id: materiaId,
          nome: nomeDaMateria(recebido.nome, mapa.nome),
          cor: PALETA[(await repo.listarMaterias(usuarioId)).length % PALETA.length],
          criadaEm: new Date().toISOString(),
          temas: mapa.temas.map((t) => ({
            id: randomUUID(),
            nome: t.nome,
            conceito: t.conceito,
            chave: t.chave,
            aula: null,
            questoes: null,
          })),
        });

        // Salva antes de gerar: se a geracao falhar, a materia e os temas
        // sobrevivem e o aluno tenta de novo sem subir o PDF outra vez.
        await repo.salvarBlocos(usuarioId, materiaId, blocos);
        await repo.salvarMateria(usuarioId, materia);

        const primeiro = materia.temas[0]!;
        void fila.andar(tarefa.id, `Preparando a aula de ${primeiro.nome}...`, 0.3);

        const trilha = await gerarTrilha(
          gerador,
          blocos,
          primeiro,
          questoesPorTema,
          (feitas, total) =>
            void fila.andar(
              tarefa.id,
              feitas < total ? 'Criando os exercicios...' : 'Fechando a trilha...',
              0.3 + 0.65 * (feitas / total),
            ),
        );
        await repo.salvarMateria(usuarioId, comTemaGerado(materia, primeiro.id, trilha));

        usuario.cota.questoesUsadas += questoesPorTema;
        await repo.salvarUsuario(usuario);

        return {
          materiaId,
          temaId: primeiro.id,
          custoUSD: Number((mapa.custo.totalUSD + trilha.custo.totalUSD).toFixed(4)),
          ...(aviso ? { aviso } : {}),
        };
      },
      (erro) => responderErro(reply, erro, 'gerar materia'),
      segurar,
    );

    return reply.code(202).send({ tarefaId: tarefa.id, cota: usuario.cota });
  });

  /** Gera a trilha de um tema. E aqui que a cota e consumida. */
  app.post('/materias/:materiaId/temas/:temaId/gerar', async (req, reply) => {
    const { usuarioId, fuso } = identificar(req);
    const { materiaId, temaId } = req.params as { materiaId: string; temaId: string };

    const materia = await repo.obterMateria(usuarioId, materiaId);
    if (!materia) return reply.code(404).send({ erro: 'Materia nao encontrada.' });

    const tema = materia.temas.find((t) => t.id === temaId);
    if (!tema) return reply.code(404).send({ erro: 'Tema nao encontrado.' });
    if (tema.questoes) return reply.send({ materia, temaGerado: temaId, custoUSD: 0 });

    const blocos = await repo.obterBlocos(usuarioId, materiaId);
    if (!blocos) {
      return reply
        .code(410)
        .send({ erro: 'O material desta materia nao esta mais disponivel. Suba o PDF de novo.' });
    }

    const usuario = await repo.obterUsuario(usuarioId, fuso);
    if (temasRestantes(usuario.plano, usuario.cota.questoesUsadas) < 1) {
      return reply.code(402).send({ erro: 'Cota do mes esgotada.', cota: usuario.cota });
    }

    const tarefa = await fila.criar(usuarioId, `Preparando a aula de ${tema.nome}...`);
    executarTarefa(
      fila,
      tarefa.id,
      async () => {
        void fila.andar(tarefa.id, `Preparando a aula de ${tema.nome}...`, 0.1);
        const trilha = await gerarTrilha(
          gerador,
          blocos,
          tema,
          questoesPorTema,
          (feitas, total) =>
            void fila.andar(
              tarefa.id,
              feitas < total ? 'Criando os exercicios...' : 'Fechando a trilha...',
              0.1 + 0.85 * (feitas / total),
            ),
        );
        await repo.salvarMateria(usuarioId, comTemaGerado(materia, temaId, trilha));

        usuario.cota.questoesUsadas += questoesPorTema;
        await repo.salvarUsuario(usuario);

        return {
          materiaId,
          temaId,
          custoUSD: Number(trilha.custo.totalUSD.toFixed(4)),
        };
      },
      (erro) => responderErro(reply, erro, 'gerar tema'),
      segurar,
    );

    return reply.code(202).send({ tarefaId: tarefa.id, cota: usuario.cota });
  });
}

/**
 * Loga a causa real e devolve algo acionavel para a tela.
 *
 * O log leva o erro inteiro: e a unica copia da causa, e sem ela o dono do app
 * fica com uma mensagem generica e nenhuma pista.
 */
function responderErro(reply: FastifyReply, erro: unknown, onde: string): FalhaTarefa {
  if (erro instanceof ErroGeracao) {
    reply.log.warn({ onde, causa: erro.causa }, erro.message);
    return { mensagem: erro.message, codigo: 'resposta_invalida', adiantaTentarDeNovo: true };
  }
  const d = descreverErro(erro);
  reply.log.error({ onde, codigo: d.codigo, detalhe: d.detalhe, err: erro }, d.mensagem);
  return { mensagem: d.mensagem, codigo: d.codigo, adiantaTentarDeNovo: d.adiantaTentarDeNovo };
}
