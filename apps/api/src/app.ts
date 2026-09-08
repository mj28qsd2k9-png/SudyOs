import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Config } from './config.js';
import { criarGerador, type GeradorIA } from './ia/cliente.js';
import { RepositorioMemoria, type Repositorio } from './infra/repositorio.js';
import { rotasMaterias } from './rotas/materias.js';
import { rotasProgresso } from './rotas/progresso.js';

export type OpcoesApp = {
  config: Config;
  /** Injetaveis no teste: sem eles a app usa memoria e a API de verdade. */
  repo?: Repositorio;
  gerador?: GeradorIA;
};

export async function criarApp(opcoes: OpcoesApp): Promise<FastifyInstance> {
  const { config } = opcoes;
  const app = Fastify({
    logger: config.ambiente === 'test' ? false : { level: 'info' },
    // Geracao e varias chamadas de IA em sequencia; o padrao de 5s nao cabe.
    requestTimeout: 180_000,
  });

  await app.register(cors, {
    origin: config.corsOrigens.length > 0 ? config.corsOrigens : true,
  });

  const repo = opcoes.repo ?? new RepositorioMemoria();
  const gerador =
    opcoes.gerador ??
    criarGerador({
      modelo: config.modelo,
      aoUsar: ({ custo, fallback, nomeEsquema }) => {
        app.log.info(
          {
            esquema: nomeEsquema,
            fallback,
            usd: Number(custo.totalUSD.toFixed(5)),
            tokens: {
              entrada: custo.tokensEntrada,
              saida: custo.tokensSaida,
              pensamento: custo.tokensPensamento,
              cacheEscrito: custo.tokensCacheEscrito,
              cacheLido: custo.tokensCacheLido,
            },
          },
          'chamada de IA',
        );
      },
    });

  app.get('/saude', async () => ({
    ok: true,
    modelo: config.modelo,
    questoesPorTema: config.questoesPorTema,
    // Sem chave a geracao nao roda; melhor dizer isso aqui do que falhar depois.
    chaveConfigurada: config.temChave,
  }));

  await app.register(async (instancia) => {
    await rotasMaterias(instancia, {
      repo,
      gerador,
      questoesPorTema: config.questoesPorTema,
    });
    await rotasProgresso(instancia, { repo });
  });

  // Cliente de teste: sobe um PDF no navegador e exercita a API de ponta a ponta.
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.resolve(aqui, '../public'),
    prefix: '/teste/',
  });

  return app;
}
