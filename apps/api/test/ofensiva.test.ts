import { describe, expect, it } from 'vitest';
import {
  diaLocal,
  diasEntre,
  fusoValido,
  ofensivaVisivel,
  registrarConclusao,
  type EstadoOfensiva,
} from '@estudaai/shared';

const SP = 'America/Sao_Paulo';

function estado(parcial: Partial<EstadoOfensiva> = {}): EstadoOfensiva {
  return {
    streak: 0,
    maiorStreak: 0,
    congelamentos: 0,
    ultimoDiaConcluido: null,
    fuso: SP,
    ...parcial,
  };
}

describe('dia local', () => {
  it('usa o fuso do usuario, nao o do servidor', () => {
    // 2026-03-10T02:00Z ainda e dia 9 em Sao Paulo (UTC-3).
    const instante = new Date('2026-03-10T02:00:00Z');
    expect(diaLocal(instante, SP)).toBe('2026-03-09');
    expect(diaLocal(instante, 'UTC')).toBe('2026-03-10');
    expect(diaLocal(instante, 'Asia/Tokyo')).toBe('2026-03-10');
  });

  it('conta dias entre datas locais', () => {
    expect(diasEntre('2026-03-09', '2026-03-10')).toBe(1);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1); // 2026 nao e bissexto
    expect(diasEntre('2026-03-10', '2026-03-09')).toBe(-1);
  });

  it('rejeita fuso invalido', () => {
    expect(fusoValido(SP)).toBe(true);
    expect(fusoValido('Nao/Existe')).toBe(false);
  });
});

describe('registrarConclusao', () => {
  it('acende o primeiro dia', () => {
    const r = registrarConclusao(estado(), new Date('2026-03-10T15:00:00Z'));
    expect(r.subiu).toBe(true);
    expect(r.estado.streak).toBe(1);
    expect(r.estado.maiorStreak).toBe(1);
    expect(r.estado.ultimoDiaConcluido).toBe('2026-03-10');
  });

  it('nao conta duas vezes no mesmo dia', () => {
    const inicial = estado({ streak: 4, maiorStreak: 9, ultimoDiaConcluido: '2026-03-10' });
    const r = registrarConclusao(inicial, new Date('2026-03-10T23:00:00Z'));
    expect(r.subiu).toBe(false);
    expect(r.estado.streak).toBe(4);
    expect(r.estado).toBe(inicial);
  });

  it('soma um quando o dia anterior foi feito', () => {
    const r = registrarConclusao(
      estado({ streak: 4, maiorStreak: 4, ultimoDiaConcluido: '2026-03-09' }),
      new Date('2026-03-10T12:00:00Z'),
    );
    expect(r.estado.streak).toBe(5);
    expect(r.estado.maiorStreak).toBe(5);
    expect(r.quebrou).toBe(false);
  });

  it('gasta congelamento para cobrir o dia perdido', () => {
    const r = registrarConclusao(
      estado({ streak: 12, maiorStreak: 12, congelamentos: 2, ultimoDiaConcluido: '2026-03-08' }),
      new Date('2026-03-10T12:00:00Z'),
    );
    expect(r.estado.streak).toBe(13);
    expect(r.congelamentosGastos).toBe(1);
    expect(r.estado.congelamentos).toBe(1);
    expect(r.quebrou).toBe(false);
  });

  it('quebra quando faltam congelamentos, guardando o recorde', () => {
    const r = registrarConclusao(
      estado({ streak: 30, maiorStreak: 30, congelamentos: 1, ultimoDiaConcluido: '2026-03-05' }),
      new Date('2026-03-10T12:00:00Z'),
    );
    expect(r.quebrou).toBe(true);
    expect(r.estado.streak).toBe(1);
    expect(r.estado.maiorStreak).toBe(30);
    // Congelamento so e gasto quando cobre o buraco inteiro.
    expect(r.estado.congelamentos).toBe(1);
  });

  it('ignora data guardada no futuro em vez de zerar a ofensiva', () => {
    // Acontece se o fuso do usuario mudar para tras ou o relogio do servidor voltar.
    const inicial = estado({ streak: 7, maiorStreak: 7, ultimoDiaConcluido: '2026-03-20' });
    const r = registrarConclusao(inicial, new Date('2026-03-10T12:00:00Z'));
    expect(r.subiu).toBe(false);
    expect(r.estado.streak).toBe(7);
  });

  it('vira o dia pelo fuso do usuario, nao pelo UTC', () => {
    // 2026-03-11T02:00Z e 10/03 em Sao Paulo: ainda e o mesmo dia local.
    const inicial = estado({ streak: 3, maiorStreak: 3, ultimoDiaConcluido: '2026-03-10' });
    const r = registrarConclusao(inicial, new Date('2026-03-11T02:00:00Z'));
    expect(r.subiu).toBe(false);
    expect(r.estado.streak).toBe(3);
  });
});

describe('ofensivaVisivel', () => {
  it('mantem o numero de quem estudou ontem e ainda nao estudou hoje', () => {
    const e = estado({ streak: 6, ultimoDiaConcluido: '2026-03-09' });
    expect(ofensivaVisivel(e, new Date('2026-03-10T12:00:00Z'))).toBe(6);
  });

  it('mostra zero para quem deixou um dia inteiro passar sem congelamento', () => {
    const e = estado({ streak: 6, ultimoDiaConcluido: '2026-03-08' });
    expect(ofensivaVisivel(e, new Date('2026-03-10T12:00:00Z'))).toBe(0);
  });

  it('segura o numero enquanto houver congelamento para cobrir', () => {
    const e = estado({ streak: 6, congelamentos: 1, ultimoDiaConcluido: '2026-03-08' });
    expect(ofensivaVisivel(e, new Date('2026-03-10T12:00:00Z'))).toBe(6);
  });

  it('e zero para quem nunca concluiu', () => {
    expect(ofensivaVisivel(estado(), new Date('2026-03-10T12:00:00Z'))).toBe(0);
  });
});
