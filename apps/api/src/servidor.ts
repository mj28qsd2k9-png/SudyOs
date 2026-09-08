import { carregarConfig } from './config.js';
import { criarApp } from './app.js';

const config = carregarConfig();
const app = await criarApp({ config });

if (!config.temChave) {
  app.log.warn(
    'ANTHROPIC_API_KEY nao esta definida: as rotas de geracao vao falhar. ' +
      'Copie .env.example para .env e preencha a chave.',
  );
}

try {
  await app.listen({ port: config.porta, host: config.host });
  app.log.info(`Cliente de teste em http://localhost:${config.porta}/teste/`);
} catch (erro) {
  app.log.error(erro);
  process.exit(1);
}

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, async () => {
    await app.close();
    process.exit(0);
  });
}
