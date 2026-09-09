import { describe, expect, it } from 'vitest';
import { corrigir } from '@estudaai/shared';
import { deduplicar, intercalar, normalizarQuestao } from '../src/ia/normalizar.js';

const explicacao = 'Porque sim, e essa e a razao.';

describe('normalizarQuestao — os 7 tipos', () => {
  it('aceita multipla escolha', () => {
    const q = normalizarQuestao(
      { tipo: 'mc', pergunta: 'Qual?', opcoes: ['a', 'b'], correta: 1, explicacao },
      'prova',
    );
    expect(q?.tipo).toBe('mc');
    expect(q && corrigir(q, 1)).toBe(true);
    expect(q && corrigir(q, 0)).toBe(false);
  });

  it('aceita cenario com contexto e descarta contexto vazio', () => {
    const comContexto = normalizarQuestao(
      {
        tipo: 'cenario',
        contexto: 'Uma celula muscular precisa de muita energia.',
        pergunta: 'O que esperar?',
        opcoes: ['poucas', 'muitas'],
        correta: 1,
        explicacao,
      },
      'prova',
    );
    expect(comContexto).toMatchObject({ tipo: 'cenario', contexto: expect.any(String) });

    const semContexto = normalizarQuestao(
      { tipo: 'cenario', contexto: '  ', pergunta: 'E?', opcoes: ['a', 'b'], correta: 0, explicacao },
      'prova',
    );
    expect(semContexto).not.toHaveProperty('contexto');
  });

  it('aceita verdadeiro/falso, inclusive escrito por extenso', () => {
    const q = normalizarQuestao(
      { tipo: 'tf', pergunta: 'A membrana e seletiva.', resposta: 'verdadeiro', explicacao },
      'fixacao',
    );
    expect(q).toMatchObject({ tipo: 'tf', resposta: true });
    expect(q && corrigir(q, true)).toBe(true);

    const falso = normalizarQuestao(
      { tipo: 'tf', pergunta: 'Deixa tudo passar.', resposta: 'FALSO', explicacao },
      'fixacao',
    );
    expect(falso).toMatchObject({ resposta: false });
  });

  it('aceita completar frase', () => {
    const q = normalizarQuestao(
      {
        tipo: 'fill',
        antes: 'A membrana e formada por ',
        depois: '.',
        opcoes: ['proteinas', 'lipidios'],
        correta: 1,
        explicacao,
      },
      'fixacao',
    );
    expect(q?.tipo).toBe('fill');
    expect(q && corrigir(q, 1)).toBe(true);
  });

  it('aceita ligar pares nos dois formatos', () => {
    const comObjetos = normalizarQuestao(
      {
        tipo: 'match',
        pares: [
          { termo: 'Difusao', definicao: 'Do mais para o menos concentrado' },
          { termo: 'Osmose', definicao: 'Passagem de agua' },
        ],
        explicacao,
      },
      'fixacao',
    );
    expect(comObjetos).toMatchObject({ tipo: 'match' });

    // Formato antigo do prototipo: array de pares.
    const comArrays = normalizarQuestao(
      { tipo: 'match', pares: [['Difusao', 'gradiente'], ['Osmose', 'agua']], explicacao },
      'fixacao',
    );
    expect(comArrays).toMatchObject({ tipo: 'match' });
  });

  it('aceita ordenar e corrige a ordem', () => {
    const q = normalizarQuestao(
      {
        tipo: 'ordenar',
        instrucao: 'Do menor para o maior:',
        ordem_correta: ['Gene', 'Cromossomo', 'Nucleo'],
        explicacao,
      },
      'fixacao',
    );
    expect(q?.tipo).toBe('ordenar');
    expect(q && corrigir(q, ['Gene', 'Cromossomo', 'Nucleo'])).toBe(true);
    expect(q && corrigir(q, ['Cromossomo', 'Gene', 'Nucleo'])).toBe(false);
    expect(q && corrigir(q, ['Gene', 'Cromossomo'])).toBe(false);
  });

  it('aceita calc', () => {
    const q = normalizarQuestao(
      { tipo: 'calc', pergunta: 'Quanto e 2+2?', opcoes: ['3', '4'], correta: 1, explicacao },
      'prova',
    );
    expect(q?.tipo).toBe('calc');
  });
});

describe('normalizarQuestao — o que deve ser descartado', () => {
  const casos: [string, unknown][] = [
    ['indice fora do alcance', { tipo: 'mc', pergunta: 'Q', opcoes: ['a', 'b'], correta: 5, explicacao }],
    ['indice negativo', { tipo: 'mc', pergunta: 'Q', opcoes: ['a', 'b'], correta: -1, explicacao }],
    ['uma alternativa so', { tipo: 'mc', pergunta: 'Q', opcoes: ['a'], correta: 0, explicacao }],
    ['sem pergunta', { tipo: 'mc', pergunta: '', opcoes: ['a', 'b'], correta: 0, explicacao }],
    ['sem explicacao', { tipo: 'mc', pergunta: 'Q', opcoes: ['a', 'b'], correta: 0, explicacao: '' }],
    ['tf sem resposta booleana', { tipo: 'tf', pergunta: 'Q', resposta: 'talvez', explicacao }],
    ['fill sem texto ao redor', { tipo: 'fill', antes: ' ', depois: '', opcoes: ['a', 'b'], correta: 0, explicacao }],
    [
      // Visto numa apostila de ESG de verdade: a frase completa ficava
      // "...social and governance governance" e a questao se respondia sozinha.
      'fill com a resposta escrita depois da lacuna',
      {
        tipo: 'fill',
        antes: 'ESG significa environmental, social and ',
        depois: ' governance, ou seja, ambiental, social e governanca.',
        opcoes: ['governance', 'growth', 'government'],
        correta: 0,
        explicacao,
      },
    ],
    [
      'fill com a resposta escrita antes da lacuna',
      {
        tipo: 'fill',
        antes: 'A mitocondria produz energia. A ',
        depois: ' e a usina da celula.',
        opcoes: ['mitocondria', 'membrana'],
        correta: 0,
        explicacao,
      },
    ],
    ['match com um par so', { tipo: 'match', pares: [['a', 'b']], explicacao }],
    ['ordenar com item repetido', { tipo: 'ordenar', instrucao: 'Ordene:', ordem_correta: ['a', 'a'], explicacao }],
    ['ordenar sem instrucao', { tipo: 'ordenar', instrucao: '', ordem_correta: ['a', 'b'], explicacao }],
    ['tipo desconhecido', { tipo: 'palavra_cruzada', pergunta: 'Q', explicacao }],
    ['nao e objeto', 'isto nao e uma questao'],
    ['nulo', null],
  ];

  it.each(casos)('descarta: %s', (_nome, bruta) => {
    expect(normalizarQuestao(bruta, 'prova')).toBeNull();
  });

  it('nao recusa fill por repetir palavra curta ao redor da lacuna', () => {
    // "de" aparecer duas vezes numa frase e normal; recusar por isso jogaria
    // fora exercicio bom.
    const q = normalizarQuestao(
      {
        tipo: 'fill',
        antes: 'O nucleo guarda o material genetico de ',
        depois: ' de cada celula.',
        opcoes: ['DNA', 'RNA'],
        correta: 0,
        explicacao,
      },
      'fixacao',
    );
    expect(q).not.toBeNull();
  });

  it('aceita fill quando a palavra so aparece dentro de outra', () => {
    // "governanca" contem "governa", mas nao entrega a resposta.
    const q = normalizarQuestao(
      {
        tipo: 'fill',
        antes: 'A ',
        depois: ' corporativa orienta conselheiros e diretores.',
        opcoes: ['governanca', 'governo'],
        correta: 0,
        explicacao,
      },
      'fixacao',
    );
    expect(q).not.toBeNull();
  });

  it('aceita indice vindo como string numerica', () => {
    const q = normalizarQuestao(
      { tipo: 'mc', pergunta: 'Q', opcoes: ['a', 'b'], correta: '1', explicacao },
      'prova',
    );
    expect(q).toMatchObject({ correta: 1 });
  });
});

describe('deduplicar e intercalar', () => {
  const q = (tipo: 'mc' | 'tf', pergunta: string, familia: 'prova' | 'fixacao') =>
    normalizarQuestao(
      tipo === 'mc'
        ? { tipo, pergunta, opcoes: ['a', 'b'], correta: 0, explicacao }
        : { tipo, pergunta, resposta: true, explicacao },
      familia,
    )!;

  it('remove enunciados repetidos', () => {
    const lista = [q('mc', 'Mesma pergunta', 'prova'), q('mc', 'MESMA PERGUNTA', 'prova')];
    expect(deduplicar(lista)).toHaveLength(1);
  });

  it('alterna fixacao e prova, comecando pela fixacao', () => {
    const lista = [
      q('mc', 'P1', 'prova'),
      q('mc', 'P2', 'prova'),
      q('tf', 'F1', 'fixacao'),
      q('tf', 'F2', 'fixacao'),
    ];
    expect(intercalar(lista).map((x) => x.familia)).toEqual([
      'fixacao',
      'prova',
      'fixacao',
      'prova',
    ]);
  });

  it('nao perde questoes quando as familias tem tamanhos diferentes', () => {
    const lista = [q('mc', 'P1', 'prova'), q('tf', 'F1', 'fixacao'), q('tf', 'F2', 'fixacao')];
    expect(intercalar(lista)).toHaveLength(3);
  });
});
