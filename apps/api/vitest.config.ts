import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Aponta para o FONTE do pacote compartilhado: o teste nao deve depender
      // de um `build` ter rodado antes.
      '@estudaai/shared': path.resolve(aqui, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
