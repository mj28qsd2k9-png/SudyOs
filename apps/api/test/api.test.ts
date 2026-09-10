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

/**
 * Contas de teste.
 *
 * As rotas agora exigem sessao, entao o teste passa pelo mesmo caminho do app:
 * cadastra e usa o token. Isso tambem faz cada teste exercitar a autenticacao
 * de graca — se o guarda quebrar, tudo aqui cai junto.
 */
const SENHA = 'senha-de-teste-123';
const contas = new WeakMap<FastifyInstance, Map<string, { token: string; usuarioId: string }>>();

async function conta(app: FastifyInstance, nome = 'ana') {
  let porApp = contas.get(app);
  if (!porApp) {
    porApp = new Map();
    contas.set(app, porApp);
  }
  const guardada = porApp.get(nome);
  if (guardada) return guardada;

  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/cadastrar',
    payload: { email: `${nome}@teste.com`, senha: SENHA },
  });
  expect(r.statusCode, `cadastro de ${nome} falhou: ${r.body}`).toBe(201);
  const token = r.json().token as string;

  const eu = await app.inject({
    method: 'GET',
    url: '/api/auth/eu',
    headers: { authorization: `Bearer ${token}` },
  });
  const nova = { token, usuarioId: eu.json().usuarioId as string };
  porApp.set(nome, nova);
  return nova;
}

async function cabecalhos(
  app: FastifyInstance,
  nome = 'ana',
  extras: Record<string, string> = {},
) {
  return { authorization: `Bearer ${(await conta(app, nome)).token}`, ...extras };
}

/**
 * Geracao virou tarefa em segundo plano: a rota responde 202 na hora e o
 * trabalho continua. O teste segue o mesmo caminho do app — pergunta o estado
 * ate a tarefa terminar.
 */
async function aguardarTarefa(app: FastifyInstance, tarefaId: string, usuario = 'ana') {
  const cab = await cabecalhos(app, usuario);
  for (let i = 0; i < 200; i += 1) {
    const r = await app.inject({ method: 'GET', url: `/api/tarefas/${tarefaId}`, headers: cab });
    const t = r.json();
    if (t.estado === 'concluida' || t.estado === 'falhou') return t;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error('a tarefa nao terminou');
}

async function subirEEsperar(
  app: FastifyInstance,
  payload: unknown,
  usuario = 'ana',
): Promise<{ materia: any; tarefa: any }> {
  const cab = await cabecalhos(app, usuario);
  const r = await app.inject({
    method: 'POST',
    url: '/api/materias',
    headers: cab,
    payload: payload as object,
  });
  if (r.statusCode !== 202) return { materia: null, tarefa: r.json() };
  const tarefa = await aguardarTarefa(app, r.json().tarefaId, usuario);
  if (tarefa.estado !== 'concluida') return { materia: null, tarefa };
  const m = await app.inject({
    method: 'GET',
    url: `/api/materias/${tarefa.resultado.materiaId}`,
    headers: cab,
  });
  return { materia: m.json().materia, tarefa };
}

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

  const subirMaterial = (texto = MATERIAL) => subirEEsperar(app, { texto });

  it('responde /saude com o modelo em uso', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, modelo: 'claude-sonnet-5', questoesPorTema: 8 });
  });

  it('mapeia os temas e ja entrega o primeiro pronto para jogar', async () => {
    const { materia, tarefa } = await subirMaterial();
    expect(tarefa.estado).toBe('concluida');
    expect(materia.nome).toBe('Biologia Celular');
    expect(materia.temas).toHaveLength(2);

    const [primeiro, segundo] = materia.temas;
    expect(primeiro.id).toBe(tarefa.resultado.temaId);
    expect(primeiro.aula.blocos.length).toBeGreaterThan(0);
    expect(primeiro.questoes).toHaveLength(8);
    // O segundo fica trancado: gerar custa cota, e quem decide e o aluno.
    expect(segundo.questoes).toBeNull();
  });

  it('responde na hora e faz o trabalho em segundo plano', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/materias',
      headers: await cabecalhos(app, 'ana'),
      payload: { texto: MATERIAL },
    });
    // 202: aceito. O aluno nao fica preso numa requisicao de dois minutos.
    expect(r.statusCode).toBe(202);
    expect(r.json().tarefaId).toEqual(expect.any(String));

    const tarefa = await aguardarTarefa(app, r.json().tarefaId);
    expect(tarefa.estado).toBe('concluida');
    expect(tarefa.progresso).toBe(1);
  });

  it('nao entrega a tarefa de um usuario para outro', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/materias',
      headers: await cabecalhos(app, 'ana'),
      payload: { texto: MATERIAL },
    });
    const espiando = await app.inject({
      method: 'GET',
      url: `/api/tarefas/${r.json().tarefaId}`,
      headers: await cabecalhos(app, 'carla'),
    });
    expect(espiando.statusCode).toBe(404);
  });

  it('usa o mesmo bloco de material em todas as chamadas do tema', async () => {
    await subirMaterial();
    const doTema = falso.chamadas.filter((c) => c.nome !== 'mapa_do_material');
    // Prefixo identico e o que permite o cache casar dentro de cada familia.
    expect(new Set(doTema.map((c) => c.material)).size).toBe(1);
  });

  it('intercala fixacao e prova na trilha', async () => {
    const { materia } = await subirMaterial();
    const familias = materia.temas[0].questoes.map((q: { familia: string }) => q.familia);
    expect(familias.slice(0, 4)).toEqual(['fixacao', 'prova', 'fixacao', 'prova']);
  });

  it('recusa material curto demais com uma explicacao util', async () => {
    // Validacao de entrada continua sincrona: nao faz sentido abrir tarefa
    // para dizer que o arquivo nao serve.
    const r = await app.inject({
      method: 'POST',
      url: '/api/materias',
      headers: await cabecalhos(app, 'ana'),
      payload: { texto: 'pouco texto' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toMatch(/escaneado/i);
  });

  it('gera um tema sob demanda e nao regera o que ja existe', async () => {
    const { materia } = await subirMaterial();
    const materiaId = materia.id;
    const segundoId = materia.temas[1].id;

    const r = await app.inject({
      method: 'POST',
      url: `/api/materias/${materiaId}/temas/${segundoId}/gerar`,
      headers: await cabecalhos(app, 'ana'),
    });
    expect(r.statusCode).toBe(202);
    expect((await aguardarTarefa(app, r.json().tarefaId)).estado).toBe('concluida');

    const atual = await app.inject({
      method: 'GET',
      url: `/api/materias/${materiaId}`,
      headers: await cabecalhos(app, 'ana'),
    });
    expect(atual.json().materia.temas[1].questoes).toHaveLength(8);

    const antes = falso.chamadas.length;
    const denovo = await app.inject({
      method: 'POST',
      url: `/api/materias/${materiaId}/temas/${segundoId}/gerar`,
      headers: await cabecalhos(app, 'ana'),
    });
    expect(denovo.statusCode).toBe(200); // ja pronto: responde sem abrir tarefa
    expect(falso.chamadas.length).toBe(antes);
  });

  it('guarda a materia mesmo quando a geracao do primeiro tema falha', async () => {
    const comFalha = criarGeradorFalso({ falharEm: ['questoes_de_prova', 'exercicios_de_fixacao'] });
    const outro = await criarApp({ config: config(), repo, gerador: comFalha.gerador });

    const r = await outro.inject({
      method: 'POST',
      url: '/api/materias',
      headers: await cabecalhos(outro, 'bia'),
      payload: { texto: MATERIAL },
    });
    const tarefa = await aguardarTarefa(outro, r.json().tarefaId, 'bia');
    expect(tarefa.estado).toBe('falhou');
    expect(tarefa.falha.mensagem).toBeTruthy();

    // A materia sobrevive: da para tentar gerar de novo sem subir o PDF outra vez.
    const lista = await outro.inject({
      method: 'GET',
      url: '/api/materias',
      headers: await cabecalhos(outro, 'bia'),
    });
    expect(lista.json().materias).toHaveLength(1);
    await outro.close();
  });

  it('nao deixa um usuario ver a materia do outro', async () => {
    const { materia } = await subirMaterial();
    const r = await app.inject({
      method: 'GET',
      url: `/api/materias/${materia.id}`,
      headers: await cabecalhos(app, 'carla'),
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('cota', () => {
  it('barra a geracao quando a cota do plano acaba', async () => {
    const repo = new RepositorioMemoria();
    const falso = criarGeradorFalso();
    const app = await criarApp({ config: config(), repo, gerador: falso.gerador });

    const { usuarioId } = await conta(app, 'duda');
    const usuario = await repo.obterUsuario(usuarioId, 'America/Sao_Paulo');
    usuario.plano = 'basico';
    usuario.cota.questoesUsadas = 80; // plano basico = 80 questoes/mes
    await repo.salvarUsuario(usuario);

    const r = await app.inject({
      method: 'POST',
      url: '/api/materias',
      headers: await cabecalhos(app, 'duda'),
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
    const { materia } = await subirEEsperar(app, { texto: MATERIAL });
    return { materiaId: materia.id, tema: materia.temas[0] };
  }

  it('corrige no servidor: o cliente manda respostas, nao o placar', async () => {
    const { materiaId, tema } = await temaPronto();
    const respostas = tema.questoes.map((q: Record<string, unknown>) =>
      q['tipo'] === 'tf' ? q['resposta'] : q['correta'],
    );

    const r = await app.inject({
      method: 'POST',
      url: '/api/progresso/concluir',
      headers: await cabecalhos(app, 'ana'),
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
      url: '/api/progresso/concluir',
      headers: await cabecalhos(app, 'ana'),
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
    const cab = await cabecalhos(app, 'ana');
    const concluir = () =>
      app.inject({
        method: 'POST',
        url: '/api/progresso/concluir',
        headers: cab,
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
    const { materia } = await subirEEsperar(app, { texto: MATERIAL });
    const naoGerado = materia.temas[1];

    const conclusao = await app.inject({
      method: 'POST',
      url: '/api/progresso/concluir',
      headers: await cabecalhos(app, 'ana'),
      payload: { materiaId: materia.id, temaId: naoGerado.id, respostas: [] },
    });
    expect(conclusao.statusCode).toBe(409);
  });

  it('/perfil devolve ofensiva, cota e xp', async () => {
    const { materiaId, tema } = await temaPronto();
    await app.inject({
      method: 'POST',
      url: '/api/progresso/concluir',
      headers: await cabecalhos(app, 'ana'),
      payload: { materiaId, temaId: tema.id, respostas: [] },
    });

    const r = await app.inject({
      method: 'GET',
      url: '/api/perfil',
      headers: await cabecalhos(app, 'ana', { 'x-fuso': 'America/Sao_Paulo' }),
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
      url: '/api/perfil',
      headers: await cabecalhos(app, 'ana', { 'x-fuso': 'Nao/Existe' }),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ofensiva.fuso).toBe('America/Sao_Paulo');
  });
});

describe('cota no perfil', () => {
  it('distingue "sem limite" de "acabou" (Infinity nao sobrevive ao JSON)', async () => {
    const repo = new RepositorioMemoria();
    const app = await criarApp({ config: config(), repo, gerador: criarGeradorFalso().gerador });

    const livre = await app.inject({
      method: 'GET',
      url: '/api/perfil',
      headers: await cabecalhos(app, 'livre'),
    });
    expect(livre.json().cota).toMatchObject({ ilimitada: true, temasRestantes: null });

    const { usuarioId } = await conta(app, 'pago');
    const usuario = await repo.obterUsuario(usuarioId, 'America/Sao_Paulo');
    usuario.plano = 'basico';
    usuario.cota.questoesUsadas = 40;
    await repo.salvarUsuario(usuario);

    const pago = await app.inject({
      method: 'GET',
      url: '/api/perfil',
      headers: await cabecalhos(app, 'pago'),
    });
    expect(pago.json().cota).toMatchObject({ ilimitada: false, temasRestantes: 2 });
    await app.close();
  });
});

const LIMITE = '----teste';

function multipart(conteudo: Buffer, nomeArquivo: string, tipo = 'application/pdf') {
  return Buffer.concat([
    Buffer.from(
      `--${LIMITE}\r\nContent-Disposition: form-data; name="arquivo"; ` +
        `filename="${nomeArquivo}"\r\nContent-Type: ${tipo}\r\n\r\n`,
    ),
    conteudo,
    Buffer.from(`\r\n--${LIMITE}--\r\n`),
  ]);
}

async function lerFixturePdf() {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(aqui, 'fixtures', 'apostila.pdf'));
}

async function enviarArquivo(app: FastifyInstance, corpo: Buffer, usuario = 'ana') {
  return app.inject({
    method: 'POST',
    url: '/api/materias',
    headers: await cabecalhos(app, usuario, {
      'content-type': `multipart/form-data; boundary=${LIMITE}`,
    }),
    payload: corpo,
  });
}

describe('upload de PDF', () => {
  it('aceita o PDF em multipart e extrai o texto no servidor', async () => {
    const app = await criarApp({
      config: config(),
      repo: new RepositorioMemoria(),
      gerador: criarGeradorFalso().gerador,
    });

    const r = await enviarArquivo(app, multipart(await lerFixturePdf(), 'Banco de Dados.pdf'));
    expect(r.statusCode).toBe(202);

    const tarefa = await aguardarTarefa(app, r.json().tarefaId);
    expect(tarefa.estado).toBe('concluida');

    const m = await app.inject({
      method: 'GET',
      url: `/api/materias/${tarefa.resultado.materiaId}`,
      headers: await cabecalhos(app, 'ana'),
    });
    // Nome de arquivo especifico vence o da IA: foi o aluno que escolheu.
    expect(m.json().materia.nome).toBe('Banco de Dados');
    expect(m.json().materia.temas[0].questoes).toHaveLength(8);
    await app.close();
  });

  it('recusa um arquivo que nao e PDF com codigo acionavel', async () => {
    const app = await criarApp({
      config: config(),
      repo: new RepositorioMemoria(),
      gerador: criarGeradorFalso().gerador,
    });

    const r = await enviarArquivo(
      app,
      multipart(Buffer.from('a'.repeat(500)), 'nota.txt', 'text/plain'),
    );
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ codigo: 'nao_e_pdf', adiantaTentarDeNovo: false });
    await app.close();
  });
});

describe('nome da materia', () => {
  const enviarPdf = async (nomeArquivo: string) => {
    const app = await criarApp({
      config: config(),
      repo: new RepositorioMemoria(),
      gerador: criarGeradorFalso().gerador,
    });
    const r = await enviarArquivo(app, multipart(await lerFixturePdf(), nomeArquivo));
    const tarefa = await aguardarTarefa(app, r.json().tarefaId);
    const m = await app.inject({
      method: 'GET',
      url: `/api/materias/${tarefa.resultado.materiaId}`,
      headers: await cabecalhos(app, 'ana'),
    });
    await app.close();
    return m.json().materia.nome as string;
  };

  // O gerador falso sempre chama a materia de "Biologia Celular".
  it.each([
    ['apostila.pdf'],
    ['scan_02.pdf'],
    ['Documento (1).pdf'],
    ['20240513_1032.pdf'],
    ['sem titulo.pdf'],
  ])('descarta nome generico de arquivo: %s', async (arquivo) => {
    expect(await enviarPdf(arquivo)).toBe('Biologia Celular');
  });

  it.each([['Direito Constitucional II.pdf'], ['Calculo 1 - prova 2.pdf']])(
    'mantem nome especifico do aluno: %s',
    async (arquivo) => {
      expect(await enviarPdf(arquivo)).toBe(arquivo.replace(/\.pdf$/i, ''));
    },
  );
});

describe('aviso de material cortado', () => {
  it('nao avisa quando o PDF coube inteiro', async () => {
    const app = await criarApp({
      config: config(),
      repo: new RepositorioMemoria(),
      gerador: criarGeradorFalso().gerador,
    });
    const r = await enviarArquivo(app, multipart(await lerFixturePdf(), 'Apostila.pdf'));
    const tarefa = await aguardarTarefa(app, r.json().tarefaId);
    expect(tarefa.estado).toBe('concluida');
    // O fixture tem 6 paginas; nada foi cortado, entao nada a avisar.
    expect(tarefa.resultado.aviso).toBeUndefined();
    await app.close();
  });
});
