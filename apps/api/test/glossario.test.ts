import { describe, expect, it } from 'vitest';
import { fatiarPorTermos, type Termo } from '@estudaai/shared';

/** Atalho: só os pedaços que viraram termo. */
function marcados(texto: string, termos: Termo[]): string[] {
  return fatiarPorTermos(texto, termos)
    .filter((p) => p.termo)
    .map((p) => p.texto);
}

/** O texto tem que sair inteiro do outro lado, sem perder nem duplicar nada. */
function remontado(texto: string, termos: Termo[]): string {
  return fatiarPorTermos(texto, termos)
    .map((p) => p.texto)
    .join('');
}

const t = (termo: string): Termo => ({ termo, significado: `o que e ${termo}` });

describe('marcacao dos termos do glossario', () => {
  it('acha o termo no meio da frase', () => {
    const texto = 'O regime de competência registra a receita quando ela acontece.';
    expect(marcados(texto, [t('regime de competência')])).toEqual(['regime de competência']);
  });

  it('casa sem acento e sem caixa, mas devolve o texto como estava', () => {
    const texto = 'A Provisão para devedores duvidosos entra no passivo.';
    expect(marcados(texto, [t('provisao')])).toEqual(['Provisão']);
  });

  it('so casa palavra inteira', () => {
    // Sem esta regra, "ativo" acende dentro de "ativos", "passivo" e "inativo",
    // e a aula vira um campo minado de sublinhados.
    const texto = 'Os ativos e os passivos de um investidor inativo.';
    expect(marcados(texto, [t('ativo')])).toEqual([]);
  });

  it('o termo mais longo ganha do mais curto', () => {
    const texto = 'O ativo circulante vira dinheiro em ate um ano.';
    expect(marcados(texto, [t('ativo'), t('ativo circulante')])).toEqual(['ativo circulante']);
  });

  it('marca cada termo uma vez so', () => {
    const texto = 'Depreciacao aqui, depreciacao ali, depreciacao em todo lugar.';
    expect(marcados(texto, [t('depreciacao')])).toHaveLength(1);
  });

  it('marca varios termos diferentes, na ordem do texto', () => {
    const texto = 'O balanco mostra o ativo e o passivo da entidade.';
    expect(marcados(texto, [t('passivo'), t('balanco'), t('ativo')])).toEqual([
      'balanco',
      'ativo',
      'passivo',
    ]);
  });

  it('nunca perde nem duplica texto', () => {
    const texto = 'O ativo, o passivo e o patrimonio liquido fecham o balanco.';
    const termos = [t('ativo'), t('passivo'), t('patrimonio liquido'), t('balanco')];
    expect(remontado(texto, termos)).toBe(texto);
  });

  it('sem glossario, devolve o texto num pedaco so', () => {
    expect(fatiarPorTermos('qualquer coisa', [])).toEqual([
      { texto: 'qualquer coisa', termo: null },
    ]);
  });

  it('ignora termo curto demais para virar destaque', () => {
    expect(marcados('o PL da empresa', [t('PL')])).toEqual([]);
  });

  it('trata ponto e parentese como texto, nao como regex', () => {
    // O "." de "art. 12" nao pode virar coringa: se virar, o termo casa com
    // "artX12" e o app sublinha uma palavra que nao existe no glossario.
    expect(marcados('previsto no (art. 12) da lei', [t('art. 12')])).toEqual(['art. 12']);
    expect(marcados('previsto no artX12 da lei', [t('art. 12')])).toEqual([]);
  });

  it('nao marca nada quando o texto nao sobrevive a normalizacao', () => {
    // Emoji e caractere composto mudam de tamanho no NFD; marcar por posicao
    // ali significa marcar no lugar errado, e sublinhado no meio da palavra e
    // pior do que sublinhado nenhum.
    const texto = 'Balanço 📊 fechado';
    expect(remontado(texto, [t('balanco')])).toBe(texto);
  });
});
