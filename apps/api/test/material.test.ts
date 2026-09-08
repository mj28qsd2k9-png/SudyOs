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
    // Cada bloco tem uma marca propria; a amostra tem que alcancar a ultima.
    const blocos = Array.from({ length: 20 }, (_, i) => `MARCA${i} ` + 'z'.repeat(2000));
    const a = amostra(blocos, 11_000);
    expect(a).toContain('MARCA0');
    expect(a).toContain('MARCA10');
    expect(a.length).toBeLessThanOrEqual(11_000);
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
