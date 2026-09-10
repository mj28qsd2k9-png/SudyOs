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
 * Palavras que aparecem em todo material academico e nao localizam nada.
 * Sem elas na lista, "Introducao a Contabilidade" casa com a apostila inteira.
 */
const VAZIAS = new Set([
  'introducao', 'conceito', 'conceitos', 'fundamentos', 'nocoes', 'principios',
  'aspectos', 'estudo', 'estudos', 'analise', 'geral', 'gerais', 'basico',
  'basicos', 'basica', 'basicas', 'parte', 'unidade', 'modulo', 'capitulo',
  'aula', 'tema', 'sobre', 'para', 'como', 'suas', 'seus', 'esta', 'este',
]);

function termosDoTema(tema: { nome: string; chave?: string[] }): string[] {
  const cru = semAcento([tema.nome, ...(tema.chave ?? [])].join(' ')).split(/\s+/);
  return [...new Set(cru)].filter((p) => p.length > 3 && !VAZIAS.has(p));
}

/**
 * Peso de cada termo: quanto mais raro no documento, mais ele localiza.
 *
 * Numa apostila de contabilidade, "contabil" aparece em todo bloco e nao diz
 * nada sobre ONDE esta o tema; "depreciacao" aparece em tres blocos e diz tudo.
 * Contar os dois igual — que era o que a versao anterior fazia — deixava a
 * escolha nas maos do termo mais comum, isto e, do acaso.
 */
function pesos(blocosSemAcento: string[], termos: string[]): Map<string, number> {
  const n = blocosSemAcento.length;
  const mapa = new Map<string, number>();
  for (const termo of termos) {
    const ondeAparece = blocosSemAcento.reduce((c, b) => c + (b.includes(termo) ? 1 : 0), 0);
    // Termo em todo bloco pesa ~0; termo em um bloco so pesa o maximo.
    mapa.set(termo, ondeAparece === 0 ? 0 : Math.log(n / ondeAparece));
  }
  return mapa;
}

/**
 * Onde cada tema mais aparece. `-1` quando nenhum termo do tema casa.
 *
 * `esperado` e onde o tema DEVERIA estar se o material fosse dividido em
 * partes iguais — e so serve para desempatar. Empate acontece o tempo todo
 * (numa apostila de contabilidade metade dos temas se chama "... contabil"), e
 * desempatar pelo primeiro bloco, que e o que o `sort` faz de graca, joga todo
 * tema para o comeco do documento. Desempatar pela posicao esperada joga cada
 * um para perto de onde ele realmente esta.
 */
function ancorar(
  blocosSemAcento: string[],
  tema: { nome: string; chave?: string[] },
  esperado: number,
): number {
  const termos = termosDoTema(tema);
  if (termos.length === 0) return -1;
  const peso = pesos(blocosSemAcento, termos);

  let melhor = -1;
  let melhorPonto = 0;
  blocosSemAcento.forEach((bloco, i) => {
    const pontos = termos.reduce((acc, t) => acc + (bloco.includes(t) ? peso.get(t)! : 0), 0);
    if (pontos <= 0) return;
    const empate = Math.abs(pontos - melhorPonto) < 1e-9;
    const ganha = empate
      ? melhor < 0 || Math.abs(i - esperado) < Math.abs(melhor - esperado)
      : pontos > melhorPonto;
    if (ganha) {
      melhorPonto = pontos;
      melhor = i;
    }
  });
  return melhor;
}

/**
 * Recorta o pedaco do material que corresponde a UM tema.
 *
 * O que a versao anterior fazia, e por que estava errado: contava quantos
 * termos do tema apareciam em cada bloco, ordenava e pegava os 3 melhores. Tres
 * defeitos, todos com o mesmo sintoma — questao do tema 5 cobrando assunto do
 * modulo 1:
 *
 * 1. Sem peso por raridade, "contabilidade" valia o mesmo que "depreciacao", e
 *    a pontuacao empatava em quase todo bloco.
 * 2. Empate + ordenacao estavel = vencem os blocos do COMECO do documento.
 *    Para todo tema que nao fosse o primeiro, isso e material de outro modulo.
 * 3. Quando nenhum termo casava, o trecho era `blocos.slice(0, 2)` — o comeco
 *    da apostila, de novo, com toda a certeza errado para o tema 7.
 *
 * E os tres blocos escolhidos podiam vir de partes distantes do documento,
 * colados um no outro: a IA lia um Frankenstein de tres modulos e cobrava os
 * tres.
 *
 * Agora: uma JANELA CONTINUA em volta do bloco onde o tema mais aparece,
 * limitada pelos temas vizinhos. Um assunto ocupa paginas seguidas — o recorte
 * tambem tem que ser seguido. E quando nada casa, o palpite e a posicao
 * proporcional do tema no documento, nao o comeco dele.
 */
export function recortarTema(
  blocos: string[],
  temas: { nome: string; chave?: string[] }[],
  indice: number,
  limite = 8000,
): string {
  if (blocos.length === 0) return '';

  const inteiro = blocos.join(' ');
  // Material pequeno cabe inteiro: recortar so faria o aluno perder contexto.
  if (inteiro.length <= limite) return inteiro;

  const semAcentos = blocos.map(semAcento);

  // Onde o tema estaria se o material fosse dividido igualmente. E chute, e so
  // e usado como desempate ou quando nenhum termo do tema casa — mas e um
  // chute muito melhor do que "o comeco da apostila".
  const proporcional = (i: number) =>
    temas.length <= 1 ? 0 : Math.round((i * (blocos.length - 1)) / (temas.length - 1));

  const ancoras = temas.map((t, i) => ancorar(semAcentos, t, proporcional(i)));

  const alvo = ancoras[indice] ?? -1;
  const centro = alvo >= 0 ? alvo : proporcional(indice);

  // Os vizinhos delimitam o territorio: o tema anterior termina onde ele
  // aparece, o proximo comeca onde ele aparece. Sem isso a janela do tema 2
  // invade o tema 3 e cobra o que o aluno ainda nao viu.
  const anteriores = ancoras.slice(0, indice).filter((a) => a >= 0 && a < centro);
  const proximos = ancoras.slice(indice + 1).filter((a) => a >= 0 && a > centro);
  const esquerda = anteriores.length > 0 ? Math.max(...anteriores) + 1 : 0;
  const direita = proximos.length > 0 ? Math.min(...proximos) - 1 : blocos.length - 1;

  // Cresce a partir do centro, primeiro para a frente: um assunto continua
  // depois do titulo, raramente antes dele.
  let inicio = centro;
  let fim = centro;
  let tamanho = blocos[centro]!.length;
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    if (fim < direita && tamanho + blocos[fim + 1]!.length <= limite) {
      fim += 1;
      tamanho += blocos[fim]!.length;
      cresceu = true;
    }
    if (inicio > esquerda && tamanho + blocos[inicio - 1]!.length <= limite) {
      inicio -= 1;
      tamanho += blocos[inicio]!.length;
      cresceu = true;
    }
  }

  return blocos.slice(inicio, fim + 1).join(' ').slice(0, limite);
}
