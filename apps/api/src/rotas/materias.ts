import Anthropic from '@anthropic-ai/sdk';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { MateriaSchema, temasRestantes, type Materia } from '@estudaai/shared';
import { ErroGeracao, type GeradorIA } from '../ia/cliente.js';
import { gerarTrilha, mapearMaterial } from '../ia/gerar.js';
import {
  fatiar,
  MAX_CARACTERES_MATERIAL,
  MIN_CARACTERES_MATERIAL,
  normalizarMaterial,
} from '../material/texto.js';
import { comTemaGerado, type Repositorio } from '../infra/repositorio.js';
import { identificar } from './contexto.js';

const CorpoNovaMateria = z.object({
  /**
   * Texto do PDF. A extracao roda no cliente (pdf.js): evita subir o arquivo
   * inteiro e mantem o backend sem parser de PDF.
   */
  texto: z.string(),
  nome: z.string().trim().max(120).optional(),
});

const PALETA = ['#E8501A', '#2FA36B', '#3BA9E0', '#FF7A45', '#B83C10'];

export type DependenciasRotas = {
  repo: Repositorio;
  gerador: GeradorIA;
  questoesPorTema: number;
};

export async function rotasMaterias(app: FastifyInstance, deps: DependenciasRotas) {
  const { repo, gerador, questoesPorTema } = deps;

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
    const corpo = CorpoNovaMateria.safeParse(req.body);
    if (!corpo.success) {
      return reply.code(400).send({ erro: 'Corpo invalido.', detalhe: corpo.error.issues });
    }

    const texto = normalizarMaterial(corpo.data.texto);
    if (texto.length < MIN_CARACTERES_MATERIAL) {
      return reply.code(422).send({
        erro:
          'Esse material tem pouco texto (pode ser um PDF escaneado). ' +
          'Preciso de um PDF com texto de verdade.',
      });
    }
    if (texto.length > MAX_CARACTERES_MATERIAL) {
      return reply
        .code(413)
        .send({ erro: 'Material grande demais. Divida em partes menores.' });
    }

    const usuario = await repo.obterUsuario(usuarioId, fuso);
    if (temasRestantes(usuario.plano, usuario.cota.questoesUsadas) < 1) {
      return reply.code(402).send({ erro: 'Cota do mes esgotada.', cota: usuario.cota });
    }

    const blocos = fatiar(texto);

    let mapa;
    try {
      mapa = await mapearMaterial(gerador, blocos);
    } catch (erro) {
      return reply.code(502).send({ erro: mensagemDeErro(erro) });
    }

    const materiaId = randomUUID();
    const materia: Materia = MateriaSchema.parse({
      id: materiaId,
      nome: corpo.data.nome?.trim() || mapa.nome,
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

    await repo.salvarBlocos(usuarioId, materiaId, blocos);
    await repo.salvarMateria(usuarioId, materia);

    const primeiro = materia.temas[0]!;
    try {
      const trilha = await gerarTrilha(gerador, blocos, primeiro, questoesPorTema);
      const atualizada = comTemaGerado(materia, primeiro.id, trilha);
      await repo.salvarMateria(usuarioId, atualizada);

      usuario.cota.questoesUsadas += questoesPorTema;
      await repo.salvarUsuario(usuario);

      return reply.code(201).send({
        materia: atualizada,
        temaGerado: primeiro.id,
        custoUSD: Number((mapa.custo.totalUSD + trilha.custo.totalUSD).toFixed(4)),
        cota: usuario.cota,
      });
    } catch (erro) {
      // O mapeamento vale: a materia fica salva com os temas por gerar, e o
      // aluno pode tentar gerar o primeiro tema de novo sem subir o PDF outra vez.
      return reply.code(207).send({
        materia,
        temaGerado: null,
        erro: mensagemDeErro(erro),
        cota: usuario.cota,
      });
    }
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

    try {
      const trilha = await gerarTrilha(gerador, blocos, tema, questoesPorTema);
      const atualizada = comTemaGerado(materia, temaId, trilha);
      await repo.salvarMateria(usuarioId, atualizada);

      usuario.cota.questoesUsadas += questoesPorTema;
      await repo.salvarUsuario(usuario);

      return reply.send({
        materia: atualizada,
        temaGerado: temaId,
        custoUSD: Number(trilha.custo.totalUSD.toFixed(4)),
        descartadas: trilha.descartadas,
        cota: usuario.cota,
      });
    } catch (erro) {
      return reply.code(502).send({ erro: mensagemDeErro(erro) });
    }
  });
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroGeracao) return erro.message;
  // Chave ausente ou invalida e problema de configuracao, nao de tentativa:
  // mandar o aluno "tentar de novo" so faria ele repetir a mesma falha.
  if (erro instanceof Anthropic.AuthenticationError) {
    return 'A chave da API da Anthropic esta ausente ou invalida no servidor.';
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return 'A IA esta sobrecarregada agora. Tenta daqui a pouco.';
  }
  return 'A geracao falhou agora. Tenta de novo.';
}
