import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
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

  /**
   * O app, servido pelo proprio backend.
   *
   * Existe para quem so quer estudar: um comando, um endereco. Dois servidores
   * e duas portas e ergonomia de quem esta desenvolvendo, e vira armadilha para
   * quem so quer usar — basta esquecer o segundo terminal para o app "nao
   * abrir". Quando a build nao existe, a rota explica como gerar em vez de dar
   * 404.
   */
  const buildDoApp = path.resolve(aqui, '../../mobile/dist');
  const temBuild = existsSync(path.join(buildDoApp, 'index.html'));

  if (temBuild) {
    await app.register(fastifyStatic, {
      root: buildDoApp,
      prefix: '/',
      decorateReply: false,
    });
    // Expo Router e uma SPA: qualquer rota desconhecida devolve o index e o
    // roteador do app resolve dali. Sem isto, recarregar em /materia/x da 404.
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api') || req.method !== 'GET') {
        return reply.code(404).send({ erro: 'Rota nao encontrada.' });
      }
      return reply.sendFile('index.html', buildDoApp);
    });
  } else {
    // Sem build, a raiz explica o que fazer — e a explicacao muda conforme o
    // modo, porque "rode npm start" para quem ESTA rodando npm run dev e um
    // conselho que nao faz sentido e faz a pessoa duvidar do que ela fez.
    const emDesenvolvimento = process.env['MODO_DEV'] === '1';
    const pagina = emDesenvolvimento
      ? `<h1 style="color:#E8501A">Você está em modo de desenvolvimento</h1>
         <p>Neste modo o app roda noutra porta, com recarga automática.
         Abra <a href="http://localhost:8081" style="color:#E8501A"><b>http://localhost:8081</b></a>
         — e, se não abrir, rode <code style="background:#FDEEE1;padding:2px 6px;border-radius:6px">npm run web</code>
         num segundo terminal.</p>
         <p style="color:#9B8579;font-size:14px">Para usar o app num endereço só,
         encerre este terminal com <b>Ctrl+C</b> e rode
         <code style="background:#FDEEE1;padding:2px 6px;border-radius:6px">npm start</code>.</p>`
      : `<h1 style="color:#E8501A">O app ainda não foi montado</h1>
         <p>Encerre este terminal com <b>Ctrl+C</b> e rode
         <code style="background:#FDEEE1;padding:2px 6px;border-radius:6px">npm start</code>
         na raiz do projeto: ele monta o app e serve tudo neste mesmo endereço.</p>
         <p style="color:#9B8579;font-size:14px">Se o <code>npm start</code> falhar ao montar,
         rode <code style="background:#FDEEE1;padding:2px 6px;border-radius:6px">npm run diagnosticar</code>
         para ver a causa.</p>`;

    app.get('/', async (_req, reply) =>
      reply.type('text/html').send(
        `<!doctype html><meta charset="utf-8"><title>Estuda AI</title>
         <body style="font:16px/1.6 system-ui;max-width:36rem;margin:12vh auto;padding:0 1.5rem;color:#4A3B32;background:#FFF9F4">
         ${pagina}</body>`,
      ),
    );
  }

  return app;
}
