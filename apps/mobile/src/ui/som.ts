import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Som do app.
 *
 * O prototipo sintetizava com Web Audio, que nao existe no React Native. Os
 * arquivos aqui sao gerados por `scripts/gerar-sons.mjs` e versionados: sao
 * poucos KB, soam como no prototipo e nao dependem de licenca de ninguem.
 *
 * Regras que valem mais do que o som em si:
 *
 * - Nunca bloqueia. Tocar som e enfeite; se falhar, o exercicio continua.
 * - Nunca interrompe musica. Quem estuda ouvindo algo nao pode ser silenciado
 *   pelo app a cada acerto — dai o modo de audio "misturar", nao "assumir".
 * - Da para desligar. Estudar em aula ou no onibus sem fone e caso real.
 */

export type NomeSom = 'acerto' | 'erro' | 'conclusao' | 'ofensiva' | 'toque';

const ARQUIVOS: Record<NomeSom, number> = {
  acerto: require('../../assets/sons/acerto.wav'),
  erro: require('../../assets/sons/erro.wav'),
  conclusao: require('../../assets/sons/conclusao.wav'),
  ofensiva: require('../../assets/sons/ofensiva.wav'),
  toque: require('../../assets/sons/toque.wav'),
};

const tocadores = new Map<NomeSom, AudioPlayer>();
let ligado = true;
let preparado = false;

function preparar(): void {
  if (preparado) return;
  preparado = true;
  // `interruptionMode: 'mixWithOthers'` e o ponto: o app entra por cima do que
  // ja estiver tocando em vez de pausar.
  void setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
  }).catch(() => undefined);

  for (const [nome, arquivo] of Object.entries(ARQUIVOS) as [NomeSom, number][]) {
    try {
      tocadores.set(nome, createAudioPlayer(arquivo));
    } catch {
      // Aparelho sem audio disponivel: o app segue mudo, sem quebrar.
    }
  }
}

export function definirSom(novoLigado: boolean): void {
  ligado = novoLigado;
  if (ligado) preparar();
}

export function somLigado(): boolean {
  return ligado;
}

export function tocar(nome: NomeSom): void {
  if (!ligado) return;
  preparar();
  const tocador = tocadores.get(nome);
  if (!tocador) return;
  try {
    // Volta ao inicio antes de tocar: sem isso, dois acertos seguidos rapido
    // fazem o segundo nao soar, porque o som ainda esta no fim do anterior.
    void tocador.seekTo(0).catch(() => undefined);
    tocador.play();
  } catch {
    // Idem: som e enfeite, nao pode derrubar a tela.
  }
}
