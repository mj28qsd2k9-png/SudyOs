#!/usr/bin/env node
/**
 * Verificador de ambiente.
 *
 * Roda antes de subir o backend. Existe porque as falhas mais comuns de
 * instalacao aparecem como erro de modulo ou de flag desconhecida, que nao
 * parecem em nada com a causa real ("seu Node e antigo", "faltou a chave").
 *
 * Checa CAPACIDADE, nao numero de versao: tentar importar o modulo responde a
 * pergunta certa mesmo quando a versao minima muda.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// O aviso "SQLite e experimental" e verdadeiro, mas no meio do relatorio ele
// parece um problema — e o relatorio existe justamente para separar o que e
// problema do que nao e.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (!(w.name === 'ExperimentalWarning' && /sqlite/i.test(w.message))) console.warn(w.message);
});

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const problemas = [];
const avisos = [];

function ok(texto) {
  console.log(`  \x1b[32m✓\x1b[0m ${texto}`);
}
function falha(texto, comoResolver) {
  console.log(`  \x1b[31m✗\x1b[0m ${texto}`);
  problemas.push({ texto, comoResolver });
}
function aviso(texto, comoResolver) {
  console.log(`  \x1b[33m!\x1b[0m ${texto}`);
  avisos.push({ texto, comoResolver });
}

console.log('\nVerificando o ambiente...\n');

// 1) Node com SQLite embutido — o requisito mais alto do projeto.
try {
  // `getBuiltinModule` responde sem carregar o modulo, entao nao dispara o
  // aviso de "SQLite e experimental" no meio da verificacao.
  const temSqlite = process.getBuiltinModule
    ? Boolean(process.getBuiltinModule('node:sqlite'))
    : Boolean(require('node:sqlite'));
  if (!temSqlite) throw new Error('ausente');
  ok(`Node ${process.version} tem o SQLite embutido`);
} catch {
  falha(
    `Node ${process.version} nao tem o modulo node:sqlite`,
    'O projeto precisa de Node 22.5 ou mais novo. Instale em https://nodejs.org ' +
      '(ou, se usa nvm: nvm install 22 && nvm use 22) e rode de novo.',
  );
}

// 2) Dependencias instaladas.
if (existsSync(path.join(raiz, 'node_modules', 'fastify'))) {
  ok('dependencias instaladas');
} else {
  falha('dependencias faltando', 'Rode: npm install');
}

// 3) A chave da Anthropic. Sem ela o app sobe, mas nao gera nada.
const env = path.join(raiz, '.env');
if (!existsSync(env)) {
  falha(
    'arquivo .env nao existe',
    'Rode: cp .env.example .env  — e cole a sua chave em ANTHROPIC_API_KEY.',
  );
} else {
  const conteudo = readFileSync(env, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('ANTHROPIC_API_KEY='));
  const valor = linha?.slice(linha.indexOf('=') + 1).trim() ?? '';
  if (!valor || valor.startsWith('sk-ant-...')) {
    falha(
      '.env existe mas a chave nao foi preenchida',
      'Abra o .env e ponha a sua chave em ANTHROPIC_API_KEY=sk-ant-...',
    );
  } else if (!valor.startsWith('sk-ant-')) {
    aviso(
      'a chave no .env nao parece uma chave da Anthropic',
      'Chaves da Anthropic comecam com sk-ant-. Confira em console.anthropic.com.',
    );
  } else {
    ok('chave da Anthropic configurada');
  }
}

// 4) A porta do backend.
const porta = Number(process.env.PORT ?? 3333);
const livre = await new Promise((resolve) => {
  const s = createServer();
  s.once('error', () => resolve(false));
  s.once('listening', () => s.close(() => resolve(true)));
  s.listen(porta, '127.0.0.1');
});
if (livre) {
  ok(`porta ${porta} livre`);
} else {
  falha(
    `porta ${porta} ja esta em uso`,
    `Ou o backend ja esta rodando noutro terminal, ou outro programa ocupou a porta. ` +
      `Feche o outro, ou rode com outra porta: PORT=3334 npm run dev`,
  );
}

// Relatorio.
if (avisos.length) {
  console.log('\nAtencao:');
  for (const a of avisos) console.log(`  - ${a.texto}\n    ${a.comoResolver}`);
}

if (problemas.length === 0) {
  console.log('\nTudo certo. Subindo o backend...\n');
  process.exit(0);
}

console.log(`\n\x1b[31mFaltou resolver ${problemas.length} coisa(s):\x1b[0m\n`);
for (const p of problemas) console.log(`  - ${p.texto}\n    ${p.comoResolver}\n`);
process.exit(1);
