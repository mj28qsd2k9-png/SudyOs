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
// Separador ASCII de proposito: o bundle escapa caractere fora do ASCII
// (o ` · ` virava `\xb7`), e quem le o carimbo de volta la de dentro — o
// `/saude` — teria que adivinhar em qual das formas ele foi parar.
const carimbo = `${commit}${sujo ? '+' : ''} (${dia})`;

console.log(`Montando o app  (versao ${carimbo})`);

/**
 * `--clear` sempre. Nao e paranoia — foi medido.
 *
 * O Metro guarda o resultado da transformacao por conteudo do ARQUIVO, e o
 * carimbo nao vem do arquivo, vem do ambiente. Sem limpar, a build sai com o
 * carimbo da build anterior: a tela diz "estou na versao X" quando esta na Y.
 * Um carimbo que mente e pior do que carimbo nenhum, porque encerra a
 * investigacao no lugar errado.
 *
 * Custo medido: 26s limpa contra 5s aproveitando cache. Vinte e um segundos,
 * numa montagem que so roda quando se atualiza o projeto — e do outro lado da
 * balanca esta a falha que ja custou horas neste projeto: artefato velho sendo
 * servido enquanto todo mundo procura o defeito no codigo novo.
 */
const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_BUILD: carimbo },
});
process.exit(r.status ?? 1);
