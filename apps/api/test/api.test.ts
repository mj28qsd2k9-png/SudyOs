import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app.js';
import { carregarConfig } from '../src/config.js';
import { RepositorioMemoria } from '../src/infra/repositorio.js';
import { criarGeradorFalso } from './apoio/geradorFalso.js';

const MATERIAL = (
  'A membrana plasmatica e a fina camada que envolve a celula e separa o interior ' +
  'do meio externo. Ela e seletivamente permeavel: escolhe o que entra e o que sai. ' +
  'O nucleo guarda o DNA, que carrega as instrucoes para a celula funcionar. ' +
  'A mitocondria e a usina de energia da celula, onde os nutrientes viram ATP. '
).repeat(6);

function config(extra: Record<string, string> = {}) {
  return carregarConfig({ NODE_ENV: 'test', QUESTOES_POR_TEMA: '8', ...extra } as NodeJS.ProcessEnv);
}

describe('rotas de geracao', () => {
  let app: FastifyInstance;
  let repo: RepositorioMemoria;
  let falso: ReturnType<typeof criarGeradorFalso>;

  beforeEach(async () => {
    repo = new RepositorioMemoria();
    falso = criarGeradorFalso();
    app = await criarApp({ config: config(), repo, gerador: falso.gerador });
  });

  afterEach(async () => {
    await app.close();
  });

  const subirMaterial = (texto = MATERIAL) =>
    app.inject({
      method: 'POST',
      url: '/materias',
      headers: { 'x-usuario-id': 'ana' },
      payload: { texto },
    });

  it('responde /saude com o modelo em uso', async () => {
    const r = await app.inject({ method: 'GET', url: '/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, modelo: 'claude-sonnet-5', questoesPorTema: 8 });
  });

  it('mapeia os temas e ja entrega o primeiro pronto para jogar', async () => {
    const r = await subirMaterial();
    expect(r.statusCode).toBe(201);

    const corpo = r.json();
    expect(corpo.materia.nome).toBe('Biologia Celular');
    expect(corpo.materia.temas).toHaveLength(2);

    const [primeiro, segundo] = corpo.materia.temas;
    expect(primeiro.id).toBe(corpo.temaGerado);
    expect(primeiro.aula.blocos.length).toBeGreaterThan(0);
    expect(primeiro.questoes).toHaveLength(8);
    // O segundo fica trancado: gerar custa cota, e quem decide e o aluno.
    expect(segundo.questoes).toBeNull();
  });

  it('pede a aula antes dos lotes de questoes, para aquecer o cache do material', async () => {
    await subirMaterial();
    const doTema = falso.chamadas.filter((c) => c.nome !== 'mapa_do_material');

    expect(doTema[0]!.nome).toBe('aula');
    // Todas as chamadas do tema compartilham o mesmo bloco de material — e o
    // prefixo identico que o cache casa.
    const materiais = new Set(doTema.map((c) => c.material));
    expect(materiais.size).toBe(1);
  });

  it('intercala fixacao e prova na trilha', async () => {
    const corpo = (await subirMaterial()).json();
    const familias = corpo.materia.temas[0].questoes.map((q: { familia: string }) => q.familia);
    expect(familias.slice(0, 4)).toEqual(['fixacao', 'prova', 'fixacao', 'prova']);
  });

  it('recusa material curto demais com uma explicacao util', async () => {
    const r = await subirMaterial('pouco texto');
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toMatch(/escaneado/i);
  });

  it('gera um tema sob demanda e nao regera o que ja existe', async () => {
    const criada = (await subirMaterial()).json();
    const materiaId = criada.materia.id;
    const segundoId = criada.materia.temas[1].id;

    const r = await app.inject({
      method: 'POST',
      url: `/materias/${materiaId}/temas/${segundoId}/gerar`,
      headers: { 'x-usuario-id': 'ana' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().materia.temas[1].questoes).toHaveLength(8);

    const antes = falso.chamadas.length;
    const denovo = await app.inject({
      method: 'POST',
      url: `/materias/${materiaId}/temas/${segundoId}/gerar`,
      headers: { 'x-usuario-id': 'ana' },
    });
    expect(denovo.statusCode).toBe(200);
    expect(falso.chamadas.length).toBe(antes); // nao chamou a IA de novo
  });

  it('guarda a materia mesmo quando a geracao do primeiro tema falha', async () => {
    const comFalha = criarGeradorFalso({ falharEm: ['questoes_de_prova', 'exercicios_de_fixacao'] });
    const outro = await criarApp({ config: config(), repo, gerador: comFalha.gerador });

    const r = await outro.inject({
      method: 'POST',
      url: '/materias',
      headers: { 'x-usuario-id': 'bia' },
      payload: { texto: MATERIAL },
    });
    expect(r.statusCode).toBe(207);
    expect(r.json().temaGerado).toBeNull();

    // A materia sobrevive: da para tentar gerar de novo sem subir o PDF outra vez.
    const lista = await outro.inject({
      method: 'GET',
      url: '/materias',
      headers: { 'x-usuario-id': 'bia' },
    });
    expect(lista.json().materias).toHaveLength(1);
    await outro.close();
  });

  it('nao deixa um usuario ver a materia do outro', async () => {
    const criada = (await subirMaterial()).json();
    const r = await app.inject({
      method: 'GET',
      url: `/materias/${criada.materia.id}`,
      headers: { 'x-usuario-id': 'carla' },
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('cota', () => {
  it('barra a geracao quando a cota do plano acaba', async () => {
    const repo = new RepositorioMemoria();
    const falso = criarGeradorFalso();
    const app = await criarApp({ config: config(), repo, gerador: falso.gerador });

    const usuario = await repo.obterUsuario('duda', 'America/Sao_Paulo');
    usuario.plano = 'basico';
    usuario.cota.questoesUsadas = 80; // plano basico = 80 questoes/mes
    await repo.salvarUsuario(usuario);

    const r = await app.inject({
      method: 'POST',
      url: '/materias',
      headers: { 'x-usuario-id': 'duda' },
      payload: { texto: MATERIAL },
    });
    expect(r.statusCode).toBe(402);
    expect(falso.chamadas).toHaveLength(0); // nem chegou a chamar a IA
    await app.close();
  });
});

describe('conclusao de tema', () => {
  let app: FastifyInstance;
  let repo: RepositorioMemoria;

  beforeEach(async () => {
    repo = new RepositorioMemoria();
    app = await criarApp({ config: config(), repo, gerador: criarGeradorFalso().gerador });
  });

  afterEach(async () => {
    await app.close();
  });

  async function temaPronto() {
    const r = await app.inject({
      method: 'POST',
      url: '/materias',
      headers: { 'x-usuario-id': 'ana' },
      payload: { texto: MATERIAL },
    });
    const corpo = r.json();
    return { materiaId: corpo.materia.id, tema: corpo.materia.temas[0] };
  }

  it('corrige no servidor: o cliente manda respostas, nao o placar', async () => {
    const { materiaId, tema } = await temaPronto();
    const respostas = tema.questoes.map((q: Record<string, unknown>) =>
      q['tipo'] === 'tf' ? q['resposta'] : q['correta'],
    );

    const r = await app.inject({
      method: 'POST',
      url: '/progresso/concluir',
      headers: { 'x-usuario-id': 'ana' },
      payload: { materiaId, temaId: tema.id, respostas },
    });

    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.acertos).toBe(tema.questoes.length);
    expect(corpo.ofensiva.streak).toBe(1);
    expect(corpo.ofensiva.subiu).toBe(true);
    expect(corpo.xpGanho).toBe(10 + tema.questoes.length * 3);
  });

  it('conta erro como erro mesmo com resposta inventada, e devolve as tags', async () => {
    const { materiaId, tema } = await temaPronto();
    const r = await app.inject({
      method: 'POST',
      url: '/progresso/concluir',
      headers: { 'x-usuario-id': 'ana' },
      payload: {
        materiaId,
        temaId: tema.id,
        respostas: tema.questoes.map(() => 'chute'),
      },
    });

    const corpo = r.json();
    expect(corpo.acertos).toBe(0);
    expect(corpo.erros).toHaveLength(tema.questoes.length);
    expect(corpo.erros[0].tags).toContain('membrana');
  });

  it('nao sobe a ofensiva duas vezes no mesmo dia', async () => {
    const { materiaId, tema } = await temaPronto();
    const concluir = () =>
      app.inject({
        method: 'POST',
        url: '/progresso/concluir',
        headers: { 'x-usuario-id': 'ana' },
        payload: { materiaId, temaId: tema.id, respostas: [] },
      });

    expect((await concluir()).json().ofensiva.streak).toBe(1);
    const segunda = (await concluir()).json();
    expect(segunda.ofensiva.streak).toBe(1);
    expect(segunda.ofensiva.subiu).toBe(false);
    // Mas o XP continua vindo: estudar mais no mesmo dia nao e desperdicio.
    expect(segunda.xpGanho).toBeGreaterThan(0);
  });

  it('recusa concluir um tema que ainda nao foi gerado', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/materias',
      headers: { 'x-usuario-id': 'ana' },
      payload: { texto: MATERIAL },
    });
    const corpo = r.json();
    const naoGerado = corpo.materia.temas[1];

    const conclusao = await app.inject({
      method: 'POST',
      url: '/progresso/concluir',
      headers: { 'x-usuario-id': 'ana' },
      payload: { materiaId: corpo.materia.id, temaId: naoGerado.id, respostas: [] },
    });
    expect(conclusao.statusCode).toBe(409);
  });

  it('/perfil devolve ofensiva, cota e xp', async () => {
    const { materiaId, tema } = await temaPronto();
    await app.inject({
      method: 'POST',
      url: '/progresso/concluir',
      headers: { 'x-usuario-id': 'ana' },
      payload: { materiaId, temaId: tema.id, respostas: [] },
    });

    const r = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { 'x-usuario-id': 'ana', 'x-fuso': 'America/Sao_Paulo' },
    });
    const corpo = r.json();
    expect(corpo.ofensiva.streak).toBe(1);
    expect(corpo.ofensiva.diaFeito).toBe(true);
    expect(corpo.ofensiva.proximoMarco).toBe(3);
    expect(corpo.cota.questoesUsadas).toBe(8);
    expect(corpo.temasConcluidos).toBe(1);
  });

  it('ignora fuso invalido vindo do cliente em vez de quebrar', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { 'x-usuario-id': 'ana', 'x-fuso': 'Nao/Existe' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ofensiva.fuso).toBe('America/Sao_Paulo');
  });
});
