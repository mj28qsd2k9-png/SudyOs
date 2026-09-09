/**
 * Identidade visual, herdada do prototipo.
 *
 * As variaveis do prototipo se chamavam `--roxo` por heranca do app irmao
 * (Invest AI). A cor ja era laranja ha tempo; aqui o nome passou a dizer a
 * verdade, porque nome de cor que mente custa caro depois.
 */
export const cores = {
  laranja: '#E8501A',
  laranjaEscuro: '#B83C10',
  laranjaClaro: '#FFE3D1',
  fundo: '#FFF9F4',
  card: '#FFFFFF',
  creme: '#FDEEE1',
  texto: '#4A3B32',
  textoFraco: '#9B8579',
  borda: '#F0E4D8',
  verde: '#2FA36B',
  verdeEscuro: '#1E7A4E',
  verdeFundo: '#E4F6ED',
  amarelo: '#FFC107',
  vermelho: '#EF5B5B',
  vermelhoFundo: '#FDE7E7',
  azul: '#3BA9E0',
  coral: '#FF7A45',
  desabilitado: '#E0DCF0',
  desabilitadoEscuro: '#CFC9E8',
  desabilitadoTexto: '#A9A4C8',
} as const;

export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 30,
} as const;

export const raio = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pilula: 999,
} as const;

/**
 * O protótipo usava Baloo 2 para títulos e Nunito para texto. Carregar fonte
 * custa uma dependência e um flash de texto sem estilo; enquanto ela não entra,
 * o peso e o tamanho seguram a hierarquia sozinhos.
 */
export const fonte = {
  titulo: { fontWeight: '800' as const },
  corpo: { fontWeight: '700' as const },
};

export const tamanho = {
  h1: 26,
  h2: 22,
  h3: 19,
  corpo: 15,
  pequeno: 13,
  mini: 11,
} as const;
