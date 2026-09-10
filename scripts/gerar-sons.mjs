#!/usr/bin/env node
/**
 * Gera os sons do app.
 *
 * O prototipo sintetizava com Web Audio, que nao existe no React Native. Em vez
 * de depender de um banco de sons de terceiro, os arquivos sao sintetizados
 * aqui e versionados: sao poucos KB, soam exatamente como no prototipo e nao
 * dependem de licenca de ninguem.
 *
 * Rodar de novo so e preciso ao mudar o desenho de som — os WAV ficam no git.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(raiz, 'apps/mobile/assets/sons');
const TAXA = 22_050; // suficiente para bipes curtos, e metade do peso de 44.1k

/**
 * Uma nota.
 *
 * `triangle` no lugar de seno puro porque tem harmonico e por isso atravessa o
 * alto-falante pequeno de celular; seno puro some. O envelope tem ataque de
 * 8ms — sem ele, o inicio abrupto estala.
 */
function nota({ hz, inicio, duracao, volume = 0.22, forma = 'triangle' }) {
  return { hz, inicio, duracao, volume, forma };
}

function amostra(forma, fase) {
  const t = fase % 1;
  if (forma === 'sine') return Math.sin(2 * Math.PI * t);
  // Triangular: sobe e desce em linha reta, som mais "doce" que a quadrada.
  return 4 * Math.abs(t - Math.floor(t + 0.5)) - 1;
}

function render(notas) {
  const fim = Math.max(...notas.map((n) => n.inicio + n.duracao)) + 0.05;
  const total = Math.ceil(fim * TAXA);
  const buffer = new Float32Array(total);

  for (const n of notas) {
    const de = Math.floor(n.inicio * TAXA);
    const ate = Math.min(total, de + Math.floor(n.duracao * TAXA));
    const ataque = Math.floor(0.008 * TAXA);
    for (let i = de; i < ate; i += 1) {
      const local = i - de;
      const restante = ate - i;
      // Ataque curto e queda exponencial: e o que faz soar como percussao
      // afinada em vez de bipe de micro-ondas.
      const envelope =
        Math.min(1, local / ataque) *
        Math.min(1, restante / (ataque * 2)) *
        Math.exp((-3 * local) / (ate - de));
      buffer[i] += amostra(n.forma, (n.hz * local) / TAXA) * n.volume * envelope;
    }
  }

  return buffer;
}

/** WAV PCM 16 bits, mono — o formato que toca em qualquer lugar sem codec. */
function paraWav(buffer) {
  const dados = Buffer.alloc(buffer.length * 2);
  for (let i = 0; i < buffer.length; i += 1) {
    const v = Math.max(-1, Math.min(1, buffer[i]));
    dados.writeInt16LE(Math.round(v * 32_767), i * 2);
  }

  const cabecalho = Buffer.alloc(44);
  cabecalho.write('RIFF', 0);
  cabecalho.writeUInt32LE(36 + dados.length, 4);
  cabecalho.write('WAVE', 8);
  cabecalho.write('fmt ', 12);
  cabecalho.writeUInt32LE(16, 16);
  cabecalho.writeUInt16LE(1, 20); // PCM
  cabecalho.writeUInt16LE(1, 22); // mono
  cabecalho.writeUInt32LE(TAXA, 24);
  cabecalho.writeUInt32LE(TAXA * 2, 28);
  cabecalho.writeUInt16LE(2, 32);
  cabecalho.writeUInt16LE(16, 34);
  cabecalho.write('data', 36);
  cabecalho.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cabecalho, dados]);
}

// As frequencias sao as do prototipo. Do = 523, Mi = 659, Sol = 784, Do = 1046.
const SONS = {
  // Acerto: triade maior ascendente. Curta, para nao atrasar a proxima questao.
  acerto: [
    nota({ hz: 523.25, inicio: 0, duracao: 0.12 }),
    nota({ hz: 659.25, inicio: 0.055, duracao: 0.14 }),
    nota({ hz: 783.99, inicio: 0.11, duracao: 0.2 }),
  ],
  // Erro: dois tons graves que descem. Nao e punicao, e so um "opa".
  erro: [
    nota({ hz: 311.13, inicio: 0, duracao: 0.13, volume: 0.18 }),
    nota({ hz: 233.08, inicio: 0.09, duracao: 0.22, volume: 0.18 }),
  ],
  // Conclusao: a triade completa, com a oitava no fim.
  conclusao: [
    nota({ hz: 523.25, inicio: 0, duracao: 0.14 }),
    nota({ hz: 659.25, inicio: 0.09, duracao: 0.14 }),
    nota({ hz: 783.99, inicio: 0.18, duracao: 0.16 }),
    nota({ hz: 1046.5, inicio: 0.27, duracao: 0.36, volume: 0.26 }),
  ],
  // Ofensiva: mais alto e mais longo, porque e o momento do dia.
  ofensiva: [
    nota({ hz: 659.25, inicio: 0, duracao: 0.14, volume: 0.26 }),
    nota({ hz: 783.99, inicio: 0.1, duracao: 0.14, volume: 0.26 }),
    nota({ hz: 1046.5, inicio: 0.2, duracao: 0.18, volume: 0.28 }),
    nota({ hz: 1318.5, inicio: 0.32, duracao: 0.45, volume: 0.3 }),
  ],
  // Toque: quase inaudivel de proposito. Confirma sem cansar em 20 questoes.
  toque: [nota({ hz: 330, inicio: 0, duracao: 0.045, volume: 0.09, forma: 'sine' })],
};

mkdirSync(destino, { recursive: true });
for (const [nome, notas] of Object.entries(SONS)) {
  const wav = paraWav(render(notas));
  writeFileSync(path.join(destino, `${nome}.wav`), wav);
  console.log(`  ${nome}.wav  ${(wav.length / 1024).toFixed(1)} KB`);
}
console.log(`\nGerados em ${path.relative(raiz, destino)}`);
