import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app.js';
import { carregarConfig } from '../src/config.js';
import { RepositorioMemoria } from '../src/infra/repositorio.js';
import { criarGeradorFalso } from './apoio/geradorFalso.js';

/**
 * API e app dividem o mesmo endereco — e ja se atropelaram.
 *
 * `GET /perfil` era rota da API e tela do app ao mesmo tempo. No app a
 * navegacao e do lado do cliente, entao clicar na aba Perfil funcionava; quem
 * recarregasse a pagina ali recebia o JSON da API na cara. Ninguem viu porque
 * nenhum teste andava pelo endereco de uma tela.
 *
 * A regra que impede a repeticao: toda rota da API vive sob `/api`. Este teste
 * cobra a regra, nao o sintoma — assim uma tela nova nunca colide com uma rota
 * nova, aconteca o que acontecer.
 */

/** Enderecos que o Expo Router serve como tela. */
const TELAS = [
  '/',
  '/entrar',
  '/onboarding',
  '/nova-materia',
  '/gerando',
  '/ofensiva',
  '/missoes',
  '/notas',
  '/perfil',
  '/materia/abc',
  '/trilha/abc/def',
];

describe('espaco de enderecos', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await criarApp({
      config: carregarConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      repo: new RepositorioMemoria(),
      gerador: criarGeradorFalso().gerador,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Comportamento, nao arvore de rotas: o que importa e o que o navegador
   * recebe ao recarregar a tela. Com a build do app presente vem o HTML dele;
   * sem a build vem 404. O que nao pode acontecer, nunca, e vir resposta de
   * API — 401 pedindo sessao ou 200 com JSON.
   */
  it.each(TELAS.filter((t) => t !== '/'))(
    'recarregar %s nao cai numa rota da API',
    async (tela) => {
      const r = await app.inject({ method: 'GET', url: tela });
      const tipo = r.headers['content-type'] ?? '';

      expect(r.statusCode, `${tela} pediu sessao: e rota de API, nao tela`).not.toBe(401);
      if (r.statusCode === 200) {
        expect(tipo, `${tela} devolveu JSON em vez da tela`).toContain('text/html');
      } else {
        expect(r.statusCode, `${tela} devolveu ${r.statusCode}`).toBe(404);
      }
    },
  );

  it('a API responde sob /api', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it('/saude tambem fica na raiz, para monitor e documentacao', async () => {
    const r = await app.inject({ method: 'GET', url: '/saude' });
    expect(r.statusCode).toBe(200);
  });

  it('a rota protegida sob /api continua exigindo sessao', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/perfil' });
    expect(r.statusCode).toBe(401);
  });
});
