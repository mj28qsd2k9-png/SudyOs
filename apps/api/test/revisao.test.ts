import { describe, expect, it } from 'vitest';
import {
  agendar,
  conceitosFracos,
  INTERVALO_MAXIMO_DIAS,
  ordenarVencidas,
  somarDias,
  venceu,
  type Revisao,
} from '@estudaai/shared';

const carta = (dados: Partial<Revisao> = {}): Revisao => ({
  questaoId: 'q1',
  materiaId: 'm1',
  temaId: 't1',
  tags: [],
  acertosSeguidos: 0,
  erros: 1,
  intervaloDias: 0,
  proximaEm: '2026-09-10',
  ultimaEm: '2026-09-10',
  ...dados,
});

describe('agendamento da revisao', () => {
  it('errar abre ficha e a carta vence no mesmo dia', () => {
    // Errou hoje, revisa hoje: ao sair do tema da para refazer o erro com a
    // explicacao ainda fresca. E o "Mistakes" do Duolingo.
    const c = agendar(null, false, '2026-09-10');
    expect(c).toMatchObject({ erros: 1, intervaloDias: 0, proximaEm: '2026-09-10' });
  });

  it('acertar de primeira nao cria carta nenhuma', () => {
    // O baralho e a lista dos seus erros. Se entrar tudo, ninguem termina.
    expect(agendar(null, true, '2026-09-10')).toBeNull();
  });

  it('o intervalo dobra a cada acerto', () => {
    let c = agendar(null, false, '2026-09-10')!;
    const dias: number[] = [];
    let hoje = '2026-09-10';
    for (let i = 0; i < 8; i += 1) {
      c = agendar(c, true, hoje)!;
      dias.push(c.intervaloDias);
      hoje = c.proximaEm;
    }
    expect(dias).toEqual([1, 2, 4, 8, 16, 32, 60, 60]);
  });

  it('errar de novo joga o intervalo de volta ao inicio', () => {
    let c = agendar(null, false, '2026-09-10')!;
    c = agendar(c, true, '2026-09-11')!;
    c = agendar(c, true, '2026-09-12')!;
    expect(c.intervaloDias).toBe(2);

    const depois = agendar(c, false, '2026-09-14')!;
    expect(depois.intervaloDias).toBe(0);
    expect(depois.acertosSeguidos).toBe(0);
    expect(depois.erros).toBe(2);
    expect(depois.proximaEm).toBe('2026-09-14');
  });

  it('o intervalo tem teto', () => {
    const gasto = { acertosSeguidos: 20, erros: 1, intervaloDias: INTERVALO_MAXIMO_DIAS };
    expect(agendar(gasto, true, '2026-09-10')!.intervaloDias).toBe(INTERVALO_MAXIMO_DIAS);
  });

  it('soma dias atravessando mes e ano', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('carta vence no dia marcado e continua vencida depois', () => {
    expect(venceu({ proximaEm: '2026-09-10' }, '2026-09-09')).toBe(false);
    expect(venceu({ proximaEm: '2026-09-10' }, '2026-09-10')).toBe(true);
    expect(venceu({ proximaEm: '2026-09-10' }, '2026-09-30')).toBe(true);
  });
});

describe('ordem das cartas vencidas', () => {
  it('mais atrasada primeiro; no empate, a que ele mais errou', () => {
    const cartas = [
      carta({ questaoId: 'hoje', proximaEm: '2026-09-10', erros: 9 }),
      carta({ questaoId: 'atrasada', proximaEm: '2026-09-01', erros: 1 }),
      carta({ questaoId: 'empate-pouco', proximaEm: '2026-09-05', erros: 1 }),
      carta({ questaoId: 'empate-muito', proximaEm: '2026-09-05', erros: 4 }),
      carta({ questaoId: 'futura', proximaEm: '2026-09-20', erros: 9 }),
    ];
    expect(ordenarVencidas(cartas, '2026-09-10').map((c) => c.questaoId)).toEqual([
      'atrasada',
      'empate-muito',
      'empate-pouco',
      'hoje',
    ]);
  });

  it('carta que ainda nao venceu fica de fora', () => {
    expect(ordenarVencidas([carta({ proximaEm: '2026-09-11' })], '2026-09-10')).toEqual([]);
  });
});

describe('conceitos fracos', () => {
  it('soma os erros por conceito, do pior para o melhor', () => {
    const cartas = [
      carta({ questaoId: 'a', tags: ['depreciacao', 'ativo'], erros: 3 }),
      carta({ questaoId: 'b', tags: ['depreciacao'], erros: 2 }),
      carta({ questaoId: 'c', tags: ['ativo'], erros: 1 }),
    ];
    expect(conceitosFracos(cartas)).toEqual([
      { tag: 'depreciacao', erros: 5 },
      { tag: 'ativo', erros: 4 },
    ]);
  });

  it('devolve no maximo o que foi pedido', () => {
    const cartas = Array.from({ length: 9 }, (_, i) =>
      carta({ questaoId: `q${i}`, tags: [`conceito${i}`], erros: i + 1 }),
    );
    expect(conceitosFracos(cartas, 3)).toHaveLength(3);
  });
});
