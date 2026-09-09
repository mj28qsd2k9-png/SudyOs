import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Config } from './config.js';
import { criarGerador, type GeradorIA } from './ia/cliente.js';
import type { Repositorio } from './infra/repositorio.js';
import { RepositorioSqlite } from './infra/repositorioSqlite.js';
import { rotasAuth } from './rotas/auth.js';
import { exigirSessao } from './rotas/contexto.js';
import { rotasMaterias } from './rotas/materias.js';
import { rotasProgresso } from './rotas/progresso.js';
import { MAX_BYTES_PDF } from './material/pdf.js';
import { FilaMemoria, type Fila } from './dominio/tarefas.js';

export type OpcoesApp = {
  config: Config;
  /** Injetaveis no teste: sem eles a app usa memoria e a API de verdade. */
  repo?: Repositorio;
  gerador?: GeradorIA;
  fila?: Fila;
  /** Serverless: segura a instancia viva ate a geracao terminar. */
  segurar?: (promessa: Promise<unknown>) => void;
};

export async function criarApp(opcoes: OpcoesApp): Promise<FastifyInstance> {
  const { config } = opcoes;
  const app = Fastify({
    logger: config.ambiente === 'test' ? false : { level: 'info' },
    // Geracao e varias chamadas de IA em sequencia; o padrao de 5s nao cabe.
    requestTimeout: 180_000,
    // O padrao do Fastify e 1 MB. Texto de uma apostila de 100 paginas passa
    // disso, e o 413 resultante nao explica nada para quem so subiu um PDF.
    bodyLimit: 8 * 1024 * 1024,
  });

  // O app manda o PDF; o backend extrai o texto (React Native nao roda pdf.js).
  await app.register(multipart, { limits: { fileSize: MAX_BYTES_PDF, files: 1 } });

  await app.register(cors, {
    origin: config.corsOrigens.length > 0 ? config.corsOrigens : true,
  });

  const repo = opcoes.repo ?? new RepositorioSqlite(config.banco);
  const fila = opcoes.fila ?? new FilaMemoria();
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
    await rotasAuth(instancia, { repo });
  });

  // Tudo daqui para baixo exige sessao. O guarda fica no escopo, nao em cada
  // rota: assim nao existe a chance de esquecer numa rota nova.
  await app.register(async (instancia) => {
    instancia.addHook('preHandler', exigirSessao(repo));
    await rotasMaterias(instancia, {
      repo,
      gerador,
      fila,
      ...(opcoes.segurar ? { segurar: opcoes.segurar } : {}),
      questoesPorTema: config.questoesPorTema,
    });
    await rotasProgresso(instancia, { repo });
  });

  // Tarefa concluida vira lixo depois de um tempo; sem isso a memoria so cresce.
  const faxina = setInterval(() => {
    void fila.limpar();
    void repo.limparSessoesVencidas(new Date());
  }, 15 * 60 * 1000);
  faxina.unref();
  app.addHook('onClose', async () => clearInterval(faxina));

  // Cliente de teste: sobe um PDF no navegador e exercita a API de ponta a ponta.
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.resolve(aqui, '../public'),
    prefix: '/teste/',
  });

  return app;
}
