import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' });
}

/**
 * Nenhum arquivo de codigo pode estar fora do repositorio.
 *
 * Em 09/09/2026 o .gitignore tinha `dados/` — posto para ignorar a pasta do
 * banco SQLite — e a regra, sem barra na frente, casava com QUALQUER pasta
 * chamada dados. Ela engoliu `apps/mobile/src/dados/`, que guarda o estado do
 * app e o cofre do token. Os dois arquivos nunca foram para o GitHub: aqui
 * tudo passava (typecheck, 147 testes, o app rodando no navegador) e num clone
 * limpo o app nao montava, com um erro de modulo que nao apontava para a causa.
 *
 * Typecheck e teste olham o disco. So o git sabe o que sai daqui.
 */
describe('o repositorio leva o projeto inteiro', () => {
  const fontes = () =>
    git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'])
      .split('\n')
      .filter(Boolean);

  it('nenhum codigo-fonte esta sendo ignorado pelo git', () => {
    const ignorados = fontes();

    // Build, dependencia, banco e log podem e devem ficar de fora.
    const podeFicarDeFora =
      /(^|\/)(node_modules|dist|coverage|\.expo)\/$|\.(db|db-wal|db-shm|log|tsbuildinfo)$|^\.env|(^|\/)apps\/api\/dados\//;

    const suspeitos = ignorados.filter((caminho) => !podeFicarDeFora.test(caminho));
    expect(suspeitos, `ignorado sem ser build nem dependencia: ${suspeitos.join(', ')}`).toEqual([]);
  });

  it('todo arquivo importado pelo app esta versionado', () => {
    const versionados = new Set(git(['ls-files']).split('\n').filter(Boolean));
    const codigo = [...versionados].filter(
      (f) => /^(apps|packages)\/.+\.(ts|tsx)$/.test(f) && !f.includes('/dist/'),
    );

    // Amostra de arquivos que o app precisa para montar. Se algum sumir do
    // versionamento, o clone quebra — e foi exatamente o que aconteceu.
    for (const obrigatorio of [
      'apps/mobile/src/dados/estado.tsx',
      'apps/mobile/src/dados/cofre.ts',
      'apps/mobile/src/api/cliente.ts',
      'apps/mobile/app/_layout.tsx',
      'packages/shared/src/index.ts',
    ]) {
      expect(versionados.has(obrigatorio), `${obrigatorio} nao esta no git`).toBe(true);
    }
    expect(codigo.length).toBeGreaterThan(30);
  });
});
