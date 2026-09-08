import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  corrigir,
  diaFeito,
  ofensivaVisivel,
  proximoMarco,
  registrarConclusao,
  temasRestantes,
  temaFoiGerado,
} from '@estudaai/shared';
import type { Repositorio } from '../infra/repositorio.js';
import { identificar } from './contexto.js';

const CorpoConclusao = z.object({
  materiaId: z.string().min(1),
  temaId: z.string().min(1),
  /** Resposta dada em cada questao, na ordem da trilha. */
  respostas: z.array(z.unknown()),
});

export async function rotasProgresso(app: FastifyInstance, deps: { repo: Repositorio }) {
  const { repo } = deps;

  app.get('/perfil', async (req) => {
    const { usuarioId, fuso } = identificar(req);
    const usuario = await repo.obterUsuario(usuarioId, fuso);
    const agora = new Date();
    return {
      plano: usuario.plano,
      xp: usuario.xp,
      cota: {
        ...usuario.cota,
        // Infinity nao sobrevive ao JSON (vira null). O cliente precisa saber a
        // diferenca entre "sem limite" e "acabou", entao vai explicito.
        ...(() => {
          const restantes = temasRestantes(usuario.plano, usuario.cota.questoesUsadas);
          return Number.isFinite(restantes)
            ? { ilimitada: false, temasRestantes: restantes }
            : { ilimitada: true, temasRestantes: null };
        })(),
      },
      ofensiva: {
        streak: ofensivaVisivel(usuario.ofensiva, agora),
        maiorStreak: usuario.ofensiva.maiorStreak,
        congelamentos: usuario.ofensiva.congelamentos,
        diaFeito: diaFeito(usuario.ofensiva, agora),
        proximoMarco: proximoMarco(ofensivaVisivel(usuario.ofensiva, agora)),
        fuso: usuario.ofensiva.fuso,
      },
      temasConcluidos: usuario.concluidos.length,
    };
  });

  /**
   * Conclusao de um tema.
   *
   * O cliente manda as RESPOSTAS, nao o placar: quem corrige e conta XP e o
   * servidor. E o mesmo motivo pelo qual a data da ofensiva vem do relogio do
   * servidor — placar e data enviados pelo cliente sao pedidos, nao fatos.
   */
  app.post('/progresso/concluir', async (req, reply) => {
    const { usuarioId, fuso } = identificar(req);
    const corpo = CorpoConclusao.safeParse(req.body);
    if (!corpo.success) {
      return reply.code(400).send({ erro: 'Corpo invalido.', detalhe: corpo.error.issues });
    }

    const materia = await repo.obterMateria(usuarioId, corpo.data.materiaId);
    const tema = materia?.temas.find((t) => t.id === corpo.data.temaId);
    if (!materia || !tema) return reply.code(404).send({ erro: 'Tema nao encontrado.' });
    if (!temaFoiGerado(tema)) {
      return reply.code(409).send({ erro: 'Esse tema ainda nao foi gerado.' });
    }

    const acertos = tema.questoes.reduce(
      (soma, questao, i) => soma + (corrigir(questao, corpo.data.respostas[i]) ? 1 : 0),
      0,
    );

    const usuario = await repo.obterUsuario(usuarioId, fuso);
    const ganho = 10 + acertos * 3;
    const resultado = registrarConclusao(usuario.ofensiva, new Date());

    usuario.ofensiva = resultado.estado;
    usuario.xp += ganho;
    if (!usuario.concluidos.includes(tema.id)) usuario.concluidos.push(tema.id);
    await repo.salvarUsuario(usuario);

    return {
      acertos,
      total: tema.questoes.length,
      /** Quais questoes o aluno errou — insumo da revisao espacada. */
      erros: tema.questoes
        .map((q, i) => ({ questao: q, acertou: corrigir(q, corpo.data.respostas[i]) }))
        .filter((r) => !r.acertou)
        .map((r) => ({ questaoId: r.questao.id, tags: r.questao.tags })),
      xpGanho: ganho,
      xp: usuario.xp,
      ofensiva: {
        streak: resultado.estado.streak,
        maiorStreak: resultado.estado.maiorStreak,
        subiu: resultado.subiu,
        quebrou: resultado.quebrou,
        congelamentosGastos: resultado.congelamentosGastos,
        congelamentos: resultado.estado.congelamentos,
        proximoMarco: proximoMarco(resultado.estado.streak),
      },
    };
  });
}
