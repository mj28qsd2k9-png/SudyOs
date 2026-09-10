import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app.js';
import { carregarConfig } from '../src/config.js';
import { RepositorioMemoria } from '../src/infra/repositorio.js';
import { criarGeradorFalso } from './apoio/geradorFalso.js';
import { conferirSenha, guardarSenha, precisaRehash } from '../src/dominio/senha.js';
import {
  hashDoToken,
  novoToken,
  sessaoExpirou,
  tokenDoCabecalho,
  VALIDADE_SESSAO_MS,
} from '../src/dominio/autenticacao.js';

const SENHA = 'senha-de-teste-123';

describe('hash de senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const guardado = await guardarSenha(SENHA);
    expect(await conferirSenha(SENHA, guardado)).toBe(true);
    expect(await conferirSenha('outra-senha-qualquer', guardado)).toBe(false);
  });

  it('nunca guarda a senha em claro', async () => {
    const guardado = await guardarSenha(SENHA);
    expect(guardado).not.toContain(SENHA);
    expect(guardado.startsWith('scrypt$')).toBe(true);
  });

  it('usa sal diferente a cada vez, entao senhas iguais nao tem hash igual', async () => {
    const [a, b] = [await guardarSenha(SENHA), await guardarSenha(SENHA)];
    expect(a).not.toBe(b);
    expect(await conferirSenha(SENHA, b)).toBe(true);
  });

  it('normaliza unicode: a mesma senha digitada de dois jeitos entra', async () => {
    // "á" pode vir como um ponto de codigo ou como "a" + acento combinante.
    const composta = 'senhação-123';
    const decomposta = 'senhação-123'.normalize('NFD');
    const guardado = await guardarSenha(composta);
    expect(await conferirSenha(decomposta.normalize('NFC'), guardado)).toBe(true);
  });

  it('recusa registro corrompido sem explodir', async () => {
    for (const lixo of ['', 'nada', 'scrypt$1$2$3', 'bcrypt$1$8$1$aa$bb', 'scrypt$x$8$1$aa$bb']) {
      expect(await conferirSenha(SENHA, lixo)).toBe(false);
    }
  });

  it('sabe dizer quando o custo guardado ficou para tras', async () => {
    expect(precisaRehash(await guardarSenha(SENHA))).toBe(false);
    expect(precisaRehash('scrypt$1024$8$1$aa$bb')).toBe(true);
  });
});

describe('token de sessao', () => {
  it('gera token imprevisivel e guarda so o hash', () => {
    const a = novoToken();
    const b = novoToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(a.hash).toBe(hashDoToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });

  it('le o cabecalho Bearer e recusa o resto', () => {
    expect(tokenDoCabecalho('Bearer abc123')).toBe('abc123');
    expect(tokenDoCabecalho('bearer abc123')).toBe('abc123');
    expect(tokenDoCabecalho('Basic abc123')).toBeNull();
    expect(tokenDoCabecalho('abc123')).toBeNull();
    expect(tokenDoCabecalho(undefined)).toBeNull();
    expect(tokenDoCabecalho('Bearer ')).toBeNull();
  });

  it('sabe quando venceu', () => {
    const base = {
      tokenHash: 'h',
      usuarioId: 'u',
      criadaEm: '2026-01-01T00:00:00.000Z',
      ultimoUso: '2026-01-01T00:00:00.000Z',
    };
    const viva = { ...base, expiraEm: '2026-06-01T00:00:00.000Z' };
    expect(sessaoExpirou(viva, new Date('2026-05-31T23:59:00Z'))).toBe(false);
    expect(sessaoExpirou(viva, new Date('2026-06-01T00:00:01Z'))).toBe(true);
  });
});

describe('rotas de autenticacao', () => {
  let app: FastifyInstance;
  let repo: RepositorioMemoria;

  beforeEach(async () => {
    repo = new RepositorioMemoria();
    app = await criarApp({
      config: carregarConfig({ NODE_ENV: 'test', QUESTOES_POR_TEMA: '8' } as NodeJS.ProcessEnv),
      repo,
      gerador: criarGeradorFalso().gerador,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const cadastrar = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/auth/cadastrar', payload });

  const entrar = (email: string, senha: string) =>
    app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { email, senha } });

  it('cadastra e ja devolve sessao utilizavel', async () => {
    const r = await cadastrar({ email: 'ana@teste.com', senha: SENHA });
    expect(r.statusCode).toBe(201);
    const { token, expiraEm } = r.json();
    expect(token).toEqual(expect.any(String));
    expect(Date.parse(expiraEm)).toBeGreaterThan(Date.now());

    const eu = await app.inject({
      method: 'GET',
      url: '/api/auth/eu',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(eu.statusCode).toBe(200);
    expect(eu.json().email).toBe('ana@teste.com');
  });

  it('trata o e-mail sem caixa e sem espaco, para nao virar duas contas', async () => {
    await cadastrar({ email: 'ana@teste.com', senha: SENHA });
    const repetido = await cadastrar({ email: '  Ana@TESTE.com ', senha: SENHA });
    expect(repetido.statusCode).toBe(409);
    expect((await entrar('  ANA@teste.com ', SENHA)).statusCode).toBe(200);
  });

  it('recusa e-mail invalido e senha curta com mensagem util', async () => {
    expect((await cadastrar({ email: 'nao-e-email', senha: SENHA })).statusCode).toBe(400);
    expect((await cadastrar({ email: 'ana@teste.com', senha: 'curta' })).statusCode).toBe(400);
  });

  it('nao entrega qual dos dois errou — e-mail ou senha', async () => {
    await cadastrar({ email: 'ana@teste.com', senha: SENHA });
    const senhaErrada = await entrar('ana@teste.com', 'senha-errada-mas-longa');
    const semConta = await entrar('ninguem@teste.com', SENHA);

    expect(senhaErrada.statusCode).toBe(401);
    expect(semConta.statusCode).toBe(401);
    // Mesma mensagem e mesmo codigo: dizer "e-mail nao existe" entregaria a
    // lista de quem tem conta para quem estiver sondando.
    expect(senhaErrada.json()).toEqual(semConta.json());
  });

  it('trava depois de muitas tentativas erradas', async () => {
    await cadastrar({ email: 'ana@teste.com', senha: SENHA });
    let ultimo = 0;
    for (let i = 0; i < 10; i += 1) {
      ultimo = (await entrar('ana@teste.com', 'errada-mas-comprida')).statusCode;
    }
    expect(ultimo).toBe(429);
    // E a trava vale mesmo com a senha certa: quem esta sondando nao passa.
    expect((await entrar('ana@teste.com', SENHA)).statusCode).toBe(429);
  });

  it('sair invalida o token na hora', async () => {
    const { token } = (await cadastrar({ email: 'ana@teste.com', senha: SENHA })).json();
    const cab = { authorization: `Bearer ${token}` };

    expect((await app.inject({ method: 'GET', url: '/api/perfil', headers: cab })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/sair', headers: cab })).statusCode).toBe(204);

    const depois = await app.inject({ method: 'GET', url: '/api/perfil', headers: cab });
    expect(depois.statusCode).toBe(401);
    expect(depois.json().codigo).toBe('sessao_invalida');
  });

  it('sair-de-todos derruba as outras sessoes tambem', async () => {
    await cadastrar({ email: 'ana@teste.com', senha: SENHA });
    const a = (await entrar('ana@teste.com', SENHA)).json().token;
    const b = (await entrar('ana@teste.com', SENHA)).json().token;

    await app.inject({
      method: 'POST',
      url: '/api/auth/sair-de-todos',
      headers: { authorization: `Bearer ${a}` },
    });

    for (const token of [a, b]) {
      const r = await app.inject({
        method: 'GET',
        url: '/api/perfil',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(r.statusCode).toBe(401);
    }
  });

  it('recusa sessao vencida e a remove do banco', async () => {
    const { token } = (await cadastrar({ email: 'ana@teste.com', senha: SENHA })).json();
    const hash = hashDoToken(token);
    const sessao = (await repo.obterSessao(hash))!;
    await repo.renovarSessao(hash, new Date(Date.now() - 1000).toISOString(), sessao.ultimoUso);

    const r = await app.inject({
      method: 'GET',
      url: '/api/perfil',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json().codigo).toBe('sessao_expirada');
    expect(await repo.obterSessao(hash)).toBeNull();
  });

  it('a sessao dura o suficiente para um app de habito diario', async () => {
    const { expiraEm } = (await cadastrar({ email: 'ana@teste.com', senha: SENHA })).json();
    const dias = (Date.parse(expiraEm) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(80);
    expect(VALIDADE_SESSAO_MS / 86_400_000).toBe(90);
  });
});

describe('rotas protegidas', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await criarApp({
      config: carregarConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      repo: new RepositorioMemoria(),
      gerador: criarGeradorFalso().gerador,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const protegidas: [string, string][] = [
    ['GET', '/api/materias'],
    ['GET', '/api/materias/qualquer'],
    ['POST', '/api/materias'],
    ['POST', '/api/materias/m/temas/t/gerar'],
    ['GET', '/api/tarefas/qualquer'],
    ['GET', '/api/perfil'],
    ['POST', '/api/progresso/concluir'],
  ];

  it.each(protegidas)('%s %s exige sessao', async (method, url) => {
    const r = await app.inject({ method: method as 'GET', url, payload: {} });
    expect(r.statusCode).toBe(401);
    expect(r.json().codigo).toBe('sem_sessao');
  });

  it('token inventado nao passa', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/perfil',
      headers: { authorization: 'Bearer token-que-eu-inventei-agora' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('/saude fica aberta, para monitoramento nao precisar de conta', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/saude' })).statusCode).toBe(200);
  });
});

describe('trazer o que foi gerado antes da conta', () => {
  it('passa as materias do aparelho para a conta nova', async () => {
    const repo = new RepositorioMemoria();
    const app = await criarApp({
      config: carregarConfig({ NODE_ENV: 'test', QUESTOES_POR_TEMA: '8' } as NodeJS.ProcessEnv),
      repo,
      gerador: criarGeradorFalso().gerador,
    });

    // Simula o que o app guardou antes de existir login.
    const aparelho = 'aparelho-abc123';
    await repo.salvarMateria(aparelho, {
      id: 'm1',
      nome: 'Biologia',
      cor: '#E8501A',
      criadaEm: new Date().toISOString(),
      temas: [],
    });
    await repo.salvarBlocos(aparelho, 'm1', ['conteudo do pdf']);

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/cadastrar',
      payload: { email: 'ana@teste.com', senha: SENHA, aparelho },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().materiasTrazidas).toBe(1);

    const cab = { authorization: `Bearer ${r.json().token}` };
    const lista = await app.inject({ method: 'GET', url: '/api/materias', headers: cab });
    expect(lista.json().materias).toHaveLength(1);
    expect(lista.json().materias[0].nome).toBe('Biologia');

    // O material tambem veio: sem ele, gerar os outros temas pediria o PDF de novo.
    const eu = await app.inject({ method: 'GET', url: '/api/auth/eu', headers: cab });
    expect(await repo.obterBlocos(eu.json().usuarioId, 'm1')).toEqual(['conteudo do pdf']);

    // E nao ficou copia no aparelho: os dados mudaram de dono, nao foram clonados.
    expect(await repo.listarMaterias(aparelho)).toHaveLength(0);
    expect(await repo.obterBlocos(aparelho, 'm1')).toBeNull();
    await app.close();
  });

  it('nao deixa uma conta nova roubar os dados de um aparelho ja reivindicado', async () => {
    const repo = new RepositorioMemoria();
    const app = await criarApp({
      config: carregarConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      repo,
      gerador: criarGeradorFalso().gerador,
    });

    const primeira = await app.inject({
      method: 'POST',
      url: '/api/auth/cadastrar',
      payload: { email: 'ana@teste.com', senha: SENHA },
    });
    const eu = await app.inject({
      method: 'GET',
      url: '/api/auth/eu',
      headers: { authorization: `Bearer ${primeira.json().token}` },
    });
    const idDaAna = eu.json().usuarioId as string;
    await repo.salvarMateria(idDaAna, {
      id: 'm1',
      nome: 'Biologia da Ana',
      cor: '#E8501A',
      criadaEm: new Date().toISOString(),
      temas: [],
    });

    // Bia tenta se cadastrar apontando para o id da Ana.
    const bia = await app.inject({
      method: 'POST',
      url: '/api/auth/cadastrar',
      payload: { email: 'bia@teste.com', senha: SENHA, aparelho: idDaAna },
    });
    expect(bia.json().materiasTrazidas).toBe(0);

    const daAna = await app.inject({
      method: 'GET',
      url: '/api/materias',
      headers: { authorization: `Bearer ${primeira.json().token}` },
    });
    expect(daAna.json().materias).toHaveLength(1);
    await app.close();
  });
});
