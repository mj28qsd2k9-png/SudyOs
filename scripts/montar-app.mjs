#!/usr/bin/env node
/**
 * Monta a build web do app, carimbando qual versao do codigo entrou nela.
 *
 * Existe por causa de uma pergunta que nao tinha resposta: "o app que estou
 * vendo esta atualizado?". Sem carimbo, so da para adivinhar — e adivinhar
 * errado custou uma tarde: build velha continuava sendo servida e parecia que
 * o codigo novo nao tinha funcionado.
 *
 * O carimbo vira `EXPO_PUBLIC_BUILD`, que o Expo embute no bundle, e aparece no
 * Perfil, em "Sobre". Comparar com `git log -1 --format=%h` responde a pergunta
 * em um segundo.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(raiz, 'apps', 'mobile');

function gitOuNada(args) {
  try {
    return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // Sem git (zip baixado, por exemplo) o carimbo ainda sai — so nao diz o commit.
    return '';
  }
}

const commit = gitOuNada(['rev-parse', '--short', 'HEAD']) || 'sem-git';
const sujo = gitOuNada(['status', '--porcelain']) !== '';
const dia = new Date().toISOString().slice(0, 10);
// O `+` avisa que a build saiu de uma arvore com mudanca nao commitada, que e
// exatamente quando "mas eu acabei de mudar isso" costuma acontecer.
const carimbo = `${commit}${sujo ? '+' : ''} · ${dia}`;

console.log(`Montando o app  (versao ${carimbo})`);

const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_BUILD: carimbo },
});
process.exit(r.status ?? 1);
