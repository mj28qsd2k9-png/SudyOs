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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
  // Quase sempre e o proprio projeto rodando noutro terminal: `npm start` e
  // `npm run dev` querem a mesma porta e nao convivem.
  const matar =
    process.platform === 'win32'
      ? `netstat -ano | findstr :${porta}`
      : `lsof -ti tcp:${porta} | xargs kill`;
  falha(
    `porta ${porta} ja esta em uso`,
    `Provavelmente o proprio projeto rodando noutro terminal — \`npm start\` e ` +
      `\`npm run dev\` disputam esta porta e nao podem rodar juntos.
` +
      `    Va ao outro terminal e tecle Ctrl+C, ou derrube pela porta: ${matar}
` +
      `    (Se preferir subir noutra porta: PORT=3334 npm start)`,
  );
}

// 5) A build do app e mais nova que o codigo?
//
// Esta checagem nasceu de um caso real: o aluno atualizou o codigo, subiu o
// app e nao viu nada do que tinha mudado — nem o som. O codigo estava certo; o
// que estava na tela era a build ANTERIOR, porque a montagem nao rodou (ou
// falhou, ou um servidor antigo continuou de pe servindo o `dist` velho).
// Sem esta checagem o sintoma e "voce mentiu", e a causa e invisivel.
const dist = path.join(raiz, 'apps', 'mobile', 'dist');
const indice = path.join(dist, 'index.html');

if (!existsSync(indice)) {
  aviso(
    'o app ainda nao foi montado',
    'Rode `npm start` na raiz: ele monta o app e serve tudo em http://localhost:3333.',
  );
} else {
  const montadoEm = statSync(indice).mtimeMs;
  const fontes = [
    path.join(raiz, 'apps', 'mobile', 'app'),
    path.join(raiz, 'apps', 'mobile', 'src'),
    path.join(raiz, 'apps', 'mobile', 'assets'),
    path.join(raiz, 'packages', 'shared', 'src'),
  ];
  const maisNovo = Math.max(...fontes.map(maisRecenteEm));

  if (maisNovo > montadoEm) {
    const quando = new Date(montadoEm).toLocaleString('pt-BR');
    // AVISO, nunca falha: o `npm start` roda esta verificacao ANTES de montar,
    // entao derrubar aqui impediria justamente a montagem que resolve o caso.
    aviso(
      `a build do app e mais velha que o codigo (montada em ${quando})`,
      'Se voce esta rodando `npm start`, ele vai remontar agora e isso se resolve ' +
        'sozinho.\n' +
        '    Se o app ja esta no ar e a mudanca "nao apareceu", a causa e esta: ' +
        'o navegador esta mostrando a build ANTERIOR. Encerre com Ctrl+C e rode ' +
        '`npm start` de novo.',
    );
  } else {
    ok('a build do app esta em dia com o codigo');
  }

  // O carimbo da build, lido de dentro do bundle. E o mesmo numero que aparece
  // no Perfil, em "Sobre" — imprimir aqui poupa abrir o app para comparar.
  const carimbo = carimboDaBuild(dist);
  if (carimbo) ok(`build do app: ${carimbo}  (compare com \`git log -1 --format=%h\`)`);

  // Checagem por CAPACIDADE, como o resto do script: os sons estao DENTRO da
  // build? Se nao estiverem, o app na tela e anterior ao som, ponto final.
  const sons = achar(dist, (n) => n.endsWith('.wav'));
  if (sons.length >= 5) ok(`som embutido na build (${sons.length} arquivos)`);
  else {
    aviso(
      `a build tem ${sons.length} som(ns); esperado 5`,
      'Rode `node scripts/gerar-sons.mjs` e depois `npm start` para montar de novo.',
    );
  }
}

function carimboDaBuild(pasta) {
  const js = path.join(pasta, '_expo', 'static', 'js', 'web');
  if (!existsSync(js)) return null;
  const arquivo = readdirSync(js).find((n) => n.endsWith('.js'));
  if (!arquivo) return null;
  const conteudo = readFileSync(path.join(js, arquivo), 'utf8');
  return /"([0-9a-f]{7,}\+? \(\d{4}-\d{2}-\d{2}\))"/.exec(conteudo)?.[1] ?? null;
}

function maisRecenteEm(pasta) {
  if (!existsSync(pasta)) return 0;
  let maior = 0;
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const cheio = path.join(pasta, item.name);
    maior = Math.max(maior, item.isDirectory() ? maisRecenteEm(cheio) : statSync(cheio).mtimeMs);
  }
  return maior;
}

function achar(pasta, casa, encontrados = []) {
  if (!existsSync(pasta)) return encontrados;
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const cheio = path.join(pasta, item.name);
    if (item.isDirectory()) achar(cheio, casa, encontrados);
    else if (casa(item.name)) encontrados.push(cheio);
  }
  return encontrados;
}

// 6) Tem versao nova esperando no GitHub?
//
// Barato e silencioso de proposito: dois segundos de teto, e qualquer falha
// (sem git, sem rede, sem branch remoto) simplesmente nao diz nada. Um
// verificador que trava porque o Wi-Fi caiu e pior do que um que nao avisa.
try {
  const { execFileSync } = require('node:child_process');
  const git = (args, ms = 2500) =>
    execFileSync('git', args, {
      cwd: raiz,
      encoding: 'utf8',
      timeout: ms,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

  const remoto = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const [origem, ...resto] = remoto.split('/');
  git(['fetch', origem, resto.join('/')], 6000);
  const atras = Number(git(['rev-list', '--count', `HEAD..${remoto}`]));
  if (atras > 0) {
    aviso(
      `tem ${atras} atualizacao(oes) do app esperando no GitHub`,
      'Rode `npm run atualizar`: ele puxa, instala o que mudou, monta o app e sobe. ' +
        'Um comando so.',
    );
  } else {
    ok('projeto na versao mais nova');
  }
} catch {
  // Sem git, sem rede ou sem branch remoto: seguir sem falar nada.
}

// 7) macOS: limite de arquivos abertos. O Metro abre muito arquivo de uma vez,
// e o padrao do Mac (256) e baixo demais — a build morre com EMFILE, que nao
// diz "aumente o ulimit".
if (process.platform === 'darwin') {
  const limite = Number(process.env.__LIMITE_ARQUIVOS ?? 0) || lerUlimit();
  if (limite && limite < 4096) {
    aviso(
      `limite de arquivos abertos baixo (${limite})`,
      'Se a montagem do app falhar, rode `ulimit -n 8192` neste terminal e tente ' +
        'de novo. Instalar o watchman (`brew install watchman`) resolve de vez.',
    );
  } else {
    ok('limite de arquivos abertos suficiente');
  }
}

function lerUlimit() {
  try {
    // `ulimit` e embutido do shell, entao precisa de um shell para responder.
    const { execFileSync } = require('node:child_process');
    return Number(execFileSync('/bin/sh', ['-c', 'ulimit -n'], { encoding: 'utf8' }).trim());
  } catch {
    return 0;
  }
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
