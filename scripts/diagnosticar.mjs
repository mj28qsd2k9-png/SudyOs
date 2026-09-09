#!/usr/bin/env node
/**
 * Coleta um relatorio de falha da montagem do app.
 *
 * Existe porque o npm imprime o rodape ("o comando abaixo falhou") DEPOIS da
 * causa, e quem copia o final do terminal manda justamente a parte que nao
 * explica nada. Isto roda a montagem, guarda tudo num arquivo e mostra o comeco
 * — que e onde o erro real esta — junto com o ambiente.
 */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(os.tmpdir(), 'estudaai-diagnostico.txt');

function comando(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '(nao disponivel)';
  }
}

const ambiente = [
  `sistema:    ${os.platform()} ${os.release()} (${os.arch()})`,
  `node:       ${process.version}`,
  `npm:        ${comando('npm', ['-v'])}`,
  `watchman:   ${comando('/bin/sh', ['-c', 'command -v watchman || echo nao instalado'])}`,
  `ulimit -n:  ${comando('/bin/sh', ['-c', 'ulimit -n'])}`,
  `node_modules na raiz: ${existsSync(path.join(raiz, 'node_modules')) ? 'sim' : 'NAO'}`,
  `expo instalado: ${existsSync(path.join(raiz, 'node_modules', 'expo')) ? 'sim' : 'NAO'}`,
  `assets do app: ${
    existsSync(path.join(raiz, 'apps/mobile/assets'))
      ? readdirSync(path.join(raiz, 'apps/mobile/assets')).join(', ')
      : 'PASTA AUSENTE'
  }`,
].join('\n');

console.log('\n=== AMBIENTE ===\n' + ambiente + '\n');
console.log('=== MONTANDO O APP (pode demorar ~1 min) ===\n');

// Chama o script da RAIZ, que compila o pacote compartilhado antes. Chamar o
// do mobile direto falha com "nao achei @estudaai/shared/dist/index.js" — um
// erro que aponta para o import e nao para a causa, e que faria esta ferramenta
// de diagnostico dar diagnostico falso.
const proc = spawn('npm', ['run', 'build:app'], {
  cwd: raiz,
  shell: false,
});

let saida = '';
proc.stdout.on('data', (d) => (saida += d));
proc.stderr.on('data', (d) => (saida += d));

proc.on('close', (codigo) => {
  writeFileSync(destino, `${ambiente}\n\n--- saida ---\n${saida}`);

  if (codigo === 0) {
    console.log('A montagem FUNCIONOU. Rode `npm start`.\n');
    return;
  }

  // O npm repete o rodape dele; o que interessa e o que veio antes.
  const linhas = saida.split('\n').filter((l) => !l.startsWith('npm error') && l.trim() !== '');

  console.log('\x1b[31m=== A MONTAGEM FALHOU ===\x1b[0m\n');
  console.log('--- inicio da saida (a causa costuma estar aqui) ---');
  console.log(linhas.slice(0, 30).join('\n'));
  if (linhas.length > 40) {
    console.log('\n--- fim da saida ---');
    console.log(linhas.slice(-10).join('\n'));
  }
  console.log(`\n\x1b[33mRelatorio completo em: ${destino}\x1b[0m`);
  console.log('Mande o bloco acima (ou o arquivo) para eu consertar.\n');
  process.exit(1);
});
