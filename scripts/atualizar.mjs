#!/usr/bin/env node
/**
 * Atualiza o projeto e sobe o app — um comando so.
 *
 * Existe porque "puxa o codigo, instala se mudou dependencia, monta o app,
 * sobe o servidor" e uma sequencia de quatro passos em que **esquecer um passo
 * nao da erro**: da um app que abre normalmente, com o codigo de ontem. Foi
 * exatamente o que aconteceu — a tela mostrava a build anterior e a conclusao
 * natural foi "o recurso novo nao funciona".
 *
 * Regras que fazem este script ser seguro de rodar sem pensar:
 *
 * - **Nunca descarta trabalho seu.** Se houver mudanca nao commitada, ele para
 *   e explica, em vez de passar por cima.
 * - **So avanca em linha reta** (`--ff-only`). Se o historico divergiu, ele
 *   para e diz — merge automatico as cegas cria confusao pior que a original.
 * - **Sem rede, segue em frente.** Nao ter internet nao pode impedir de estudar
 *   com o que ja esta na maquina.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cor = { verde: '\x1b[32m', vermelho: '\x1b[31m', amarelo: '\x1b[33m', fim: '\x1b[0m' };

function git(args, { silencioso = false } = {}) {
  return execFileSync('git', args, {
    cwd: raiz,
    encoding: 'utf8',
    stdio: silencioso ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'inherit'],
  }).trim();
}

/** Espera sincrona, sem depender de processo externo. */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function passo(texto) {
  console.log(`\n${texto}`);
}
function ok(texto) {
  console.log(`  ${cor.verde}✓${cor.fim} ${texto}`);
}
function pare(texto, saida) {
  console.log(`\n  ${cor.vermelho}✗${cor.fim} ${texto}\n`);
  if (saida) console.log(`  ${saida}\n`);
  process.exit(1);
}

console.log('\nAtualizando o Estuda AI...');

// 1) E um clone git? Sem isso nao ha o que atualizar.
try {
  git(['rev-parse', '--git-dir'], { silencioso: true });
} catch {
  pare(
    'esta pasta nao e um clone do projeto',
    'Entre na pasta onde voce clonou o Estuda AI e rode de novo.',
  );
}

// 2) Trabalho nao salvo: para antes de tocar em qualquer coisa.
const sujo = git(['status', '--porcelain'], { silencioso: true });
if (sujo) {
  pare(
    'voce tem mudancas nao salvas neste clone',
    'Guarde ou descarte antes de atualizar:\n' +
      '    git stash          (guarda para depois)\n' +
      '    git checkout .     (descarta de vez)\n\n' +
      '  Arquivos:\n' +
      sujo
        .split('\n')
        .slice(0, 10)
        .map((l) => `    ${l}`)
        .join('\n'),
  );
}

// 3) Qual branch acompanhar. O do clone, se ele acompanha algum remoto.
let remoto = '';
try {
  remoto = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { silencioso: true });
} catch {
  pare(
    'este branch nao acompanha nenhum branch do GitHub',
    'Aponte o branch de trabalho uma vez:\n' +
      '    git branch --set-upstream-to=origin/claude/new-session-0wnc41',
  );
}
const [origem, ...resto] = remoto.split('/');
const branch = resto.join('/');

// Onde estavamos antes de mexer. E daqui que sai tanto a lista do que mudou
// quanto a decisao de reinstalar dependencia — o reflog (`HEAD@{1}`) responde
// outra pergunta e mente quando nada foi aplicado agora.
const antes = git(['rev-parse', 'HEAD'], { silencioso: true });

// 4) Buscar. Rede pode falhar; falhar aqui nao pode impedir de estudar.
passo(`Buscando novidades em ${remoto}...`);
let buscou = false;
for (const espera of [0, 2000, 4000, 8000]) {
  if (espera) esperar(espera);
  try {
    git(['fetch', origem, branch]);
    buscou = true;
    break;
  } catch {
    // Tenta de novo; a mensagem do git ja saiu na tela.
  }
}

if (!buscou) {
  console.log(
    `  ${cor.amarelo}!${cor.fim} sem conexao com o GitHub — seguindo com o que ja esta aqui`,
  );
} else {
  const atras = Number(git(['rev-list', '--count', `HEAD..${remoto}`], { silencioso: true }));
  if (atras === 0) {
    ok('ja esta na versao mais nova');
  } else {
    try {
      git(['merge', '--ff-only', remoto]);
      ok(`${atras} atualizacao(oes) aplicada(s)`);
      console.log('');
      console.log(git(['log', '--oneline', `${antes}..HEAD`], { silencioso: true }));
    } catch {
      pare(
        'o historico do seu clone divergiu do GitHub',
        'Alguem (ou voce) commitou aqui. Para ficar igual ao GitHub, descartando\n' +
          '  o que so existe nesta maquina:\n' +
          `    git reset --hard ${remoto}`,
      );
    }
  }
}

// 5) Dependencia nova? So instala se mudou — instalar a toa custa minuto.
const depois = git(['rev-parse', 'HEAD'], { silencioso: true });
const mudouLock =
  antes !== depois &&
  git(['diff', '--name-only', antes, depois], { silencioso: true })
    .split('\n')
    .some((l) => l.endsWith('package.json') || l.endsWith('package-lock.json'));

if (mudouLock) {
  passo('Dependencias mudaram, instalando...');
  const r = spawnSync('npm', ['install'], { cwd: raiz, stdio: 'inherit' });
  if (r.status !== 0) pare('a instalacao falhou', 'Rode `npm install` e leia o erro.');
  ok('dependencias em dia');
}

// 6) Sobe. O `npm start` ja verifica o ambiente, monta o app e serve tudo.
passo('Subindo o app...\n');
const r = spawnSync('npm', ['start'], { cwd: raiz, stdio: 'inherit' });
process.exit(r.status ?? 1);
