import { describe, expect, it } from 'vitest';
import {
  amostra,
  fatiar,
  normalizarMaterial,
  trechoRelevante,
} from '../src/material/texto.js';
import { extrairJSON, extrairObjetos } from '../src/ia/json.js';
import { calcularCusto, somarCustos } from '../src/ia/modelo.js';
import { QUESTOES_POR_TEMA, temasRestantes } from '@estudaai/shared';
import { faixaDeTemas } from '../src/ia/gerar.js';

describe('texto do material', () => {
  it('colapsa espacos e quebras', () => {
    expect(normalizarMaterial('  a\n\n  b \t c  ')).toBe('a b c');
  });

  it('fatia na ordem do documento, sem perder caractere', () => {
    const texto = 'x'.repeat(1000) + 'y'.repeat(500);
    const blocos = fatiar(texto, 400);
    expect(blocos).toHaveLength(4);
    expect(blocos.join('')).toBe(texto);
  });

  it('amostra o documento inteiro, nao so o comeco', () => {
    // Cada bloco comeca com a propria marca, entao da para ver de onde a
    // amostra tirou pedaco. O teste antigo usava 20 blocos e conferia a marca
    // 10 — que cabia no comeco e por isso passava mesmo com a amostra so
    // varrendo o inicio. Uma apostila de verdade tem mais de 100 blocos.
    const blocos = Array.from({ length: 140 }, (_, i) => `MARCA${i}: ` + 'z'.repeat(2400));
    const a = amostra(blocos, 11_000);

    const vistas = [...a.matchAll(/MARCA(\d+):/g)].map((m) => Number(m[1]));
    expect(vistas.length).toBeGreaterThan(8);
    // O primeiro e o ultimo bloco entram sempre: o comeco costuma ter o sumario
    // e o fim costuma ter o assunto que ninguem alcanca.
    expect(vistas).toContain(0);
    expect(vistas).toContain(139);
    // E o meio nao pode ser um buraco.
    expect(vistas.some((v) => v > 50 && v < 90)).toBe(true);
    expect(a.length).toBeLessThanOrEqual(11_000);
  });

  it('material pequeno entra inteiro na amostra', () => {
    const blocos = ['primeiro bloco curto', 'segundo bloco curto', 'terceiro bloco curto'];
    const a = amostra(blocos, 11_000);
    for (const b of blocos) expect(a).toContain(b);
  });

  it('nao quebra com material vazio', () => {
    expect(amostra([], 11_000)).toBe('');
  });

  it('acha o bloco que fala do tema, ignorando acento e caixa', () => {
    const blocos = [
      'Introducao geral do curso e apresentacao do professor.',
      'A mitocondria e a usina de energia; produz ATP a partir de nutrientes.',
      'A parede celular das plantas e feita de celulose.',
    ];
    const trecho = trechoRelevante(blocos, { nome: 'Mitocôndria', chave: ['energia', 'ATP'] });
    expect(trecho).toContain('usina de energia');
  });

  it('cai nos primeiros blocos quando nada casa', () => {
    const blocos = ['bloco um', 'bloco dois', 'bloco tres'];
    const trecho = trechoRelevante(blocos, { nome: 'Assunto Inexistente', chave: [] });
    expect(trecho).toBe('bloco um bloco dois');
  });

  it('respeita o limite de caracteres do trecho', () => {
    const blocos = Array.from({ length: 5 }, () => 'energia '.repeat(1000));
    expect(trechoRelevante(blocos, { nome: 'energia', chave: [] }, 500)).toHaveLength(500);
  });
});

describe('extracao tolerante de JSON', () => {
  it('acha o JSON no meio de markdown', () => {
    expect(extrairJSON('Claro!\n```json\n{"a":1}\n```\nEspero ter ajudado.')).toEqual({ a: 1 });
  });

  it('reclama quando nao ha JSON nenhum', () => {
    expect(() => extrairJSON('nada aqui')).toThrow();
  });

  it('aproveita os objetos completos e ignora o cortado no fim', () => {
    const texto = '[{"tipo":"mc","correta":0},{"tipo":"tf","resposta":true},{"tipo":"fill"';
    expect(extrairObjetos(texto)).toHaveLength(2);
  });

  it('nao se confunde com chaves dentro de string', () => {
    const texto = '{"pergunta":"O que significa { na notacao?","correta":0}';
    expect(extrairObjetos(texto)).toEqual([
      { pergunta: 'O que significa { na notacao?', correta: 0 },
    ]);
  });
});

describe('custo', () => {
  it('cobra leitura de cache a 10% e escrita a 125% da entrada', () => {
    const c = calcularCusto('claude-sonnet-5', {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
    // Sonnet 5: entrada US$ 2/M. 2 + 2,50 + 0,20 = 4,70.
    expect(c.entradaUSD).toBeCloseTo(4.7, 6);
  });

  it('soma chamadas', () => {
    const uma = calcularCusto('claude-haiku-4-5', { input_tokens: 1000, output_tokens: 1000 });
    const total = somarCustos([uma, uma]);
    expect(total.totalUSD).toBeCloseTo(uma.totalUSD * 2, 10);
    expect(total.tokensSaida).toBe(2000);
  });
});

describe('cota', () => {
  it('converte questoes restantes em temas', () => {
    expect(temasRestantes('basico', 0)).toBe(4); // 80 / 20
    expect(temasRestantes('basico', 60)).toBe(1);
    expect(temasRestantes('basico', 80)).toBe(0);
    expect(temasRestantes('basico', 999)).toBe(0);
  });

  it('modo livre nao tem teto', () => {
    expect(temasRestantes('livre', 10_000)).toBe(Infinity);
  });

  it('mantem o tema padrao em 20 questoes', () => {
    expect(QUESTOES_POR_TEMA).toBe(20);
  });
});

describe('quantos temas pedir', () => {
  const blocosCom = (caracteres: number) => fatiar('x'.repeat(caracteres));

  it('resumo curto nao vira uma dezena de temas', () => {
    expect(faixaDeTemas(blocosCom(8_000))).toEqual({ minimo: 4, maximo: 8 });
  });

  it('apostila grande ganha mais temas, nao um resumo forcado', () => {
    // Com teto fixo de 6, o fim de um material de 150 paginas ficava sem tema.
    expect(faixaDeTemas(blocosCom(150_000)).maximo).toBeGreaterThan(8);
    expect(faixaDeTemas(blocosCom(400_000)).maximo).toBe(14);
  });

  it('o teto para de crescer: lista de 40 temas nao ajuda ninguem', () => {
    expect(faixaDeTemas(blocosCom(2_000_000)).maximo).toBe(14);
  });

  it('material minusculo ainda pede pelo menos alguns temas', () => {
    expect(faixaDeTemas(blocosCom(300)).minimo).toBe(4);
  });
});
