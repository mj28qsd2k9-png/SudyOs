/**
 * Tratamento do texto do material — portado do prototipo.
 *
 * O PDF vira texto no cliente (pdf.js) e chega aqui como string. Extrair no
 * cliente evita subir o arquivo inteiro e mantem o backend sem dependencia de
 * parser de PDF; o servidor so precisa do texto.
 */

/** Menos que isso quase sempre e PDF escaneado (imagem sem camada de texto). */
export const MIN_CARACTERES_MATERIAL = 200;
export const MAX_CARACTERES_MATERIAL = 600_000;

export function normalizarMaterial(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** Quebra o material em blocos de tamanho fixo, na ordem do documento. */
export function fatiar(texto: string, tamanho = 2800): string[] {
  const blocos: string[] = [];
  for (let i = 0; i < texto.length; i += tamanho) {
    blocos.push(texto.slice(i, i + tamanho));
  }
  return blocos;
}

/**
 * Amostra o documento inteiro para o mapeamento de temas.
 *
 * Percorrer os blocos em ordem ate encher o limite parece cobrir o documento, e
 * nao cobre: num material de 150 paginas cabem so os ~12 primeiros blocos, ou
 * seja, as primeiras paginas. Foi assim ate 09/09/2026, e o efeito era o pior
 * possivel — a IA propunha 6 temas todos tirados do comeco da apostila e o
 * resto do material nunca virava tema.
 *
 * Agora a amostra e distribuida: pega pedacos espalhados por todo o documento,
 * do primeiro bloco ao ultimo. Material pequeno continua entrando inteiro.
 */
export function amostra(blocos: string[], limite = 11_000, maxPedacos = 24): string {
  if (blocos.length === 0) return '';

  const quantos = Math.min(blocos.length, maxPedacos);
  const porPedaco = Math.max(300, Math.floor(limite / quantos));

  const indices =
    quantos === blocos.length
      ? blocos.map((_, i) => i)
      : Array.from({ length: quantos }, (_, i) =>
          // Inclui sempre o primeiro e o ultimo bloco: o comeco costuma ter o
          // sumario e o fim costuma ter o assunto que ninguem alcanca.
          Math.round((i * (blocos.length - 1)) / (quantos - 1)),
        );

  return indices
    .map((i) => blocos[i]!.slice(0, porPedaco))
    .join(' [...] ')
    .slice(0, limite);
}

function semAcento(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ');
}

/**
 * Escolhe o trecho do material que fala do tema, por sobreposicao de palavras.
 *
 * E busca por palavra-chave, nao embedding: e barata, roda sincrona e acerta o
 * suficiente porque as palavras do tema vieram do proprio documento. Trocar por
 * busca vetorial e uma otimizacao futura, nao um pre-requisito.
 */
export function trechoRelevante(
  blocos: string[],
  tema: { nome: string; chave?: string[] },
  limite = 8000,
): string {
  const termos = semAcento([tema.nome, ...(tema.chave ?? [])].join(' '))
    .split(/\s+/)
    .filter((p) => p.length > 3);

  const pontuados = blocos.map((bloco) => {
    const texto = semAcento(bloco);
    const pontos = termos.reduce((acc, t) => acc + (texto.includes(t) ? 1 : 0), 0);
    return { bloco, pontos };
  });

  pontuados.sort((a, b) => b.pontos - a.pontos);
  const escolhidos = pontuados.filter((p) => p.pontos > 0).slice(0, 3).map((p) => p.bloco);
  const trecho = escolhidos.length > 0 ? escolhidos : blocos.slice(0, 2);
  return trecho.join(' ').slice(0, limite);
}
