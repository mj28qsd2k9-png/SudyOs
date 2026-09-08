/**
 * Ofensiva (streak) — server-authoritative.
 *
 * O handoff e explicito: a data da ultima conclusao mora no servidor, no fuso do
 * usuario, "pra ninguem burlar mudando o relogio". Entao o cliente nunca manda a
 * data: ele manda no maximo o fuso, e o servidor decide que dia e hoje.
 *
 * A ofensiva e separada da meta diaria (decisao fechada no handoff): 1 tema por
 * dia mantem a ofensiva acesa; a meta diaria (leve/normal/puxado) e engajamento
 * extra e nao pode quebrar nada.
 */

export const MAX_CONGELAMENTOS = 2;
export const CUSTO_CONGELAMENTO_XP = 100;
export const MARCOS = [3, 7, 14, 30, 60, 100, 365] as const;

export type EstadoOfensiva = {
  streak: number;
  maiorStreak: number;
  congelamentos: number;
  /** Dia local (YYYY-MM-DD) da ultima conclusao. `null` para quem nunca concluiu. */
  ultimoDiaConcluido: string | null;
  /** Fuso IANA do usuario, ex.: "America/Sao_Paulo". */
  fuso: string;
};

export type ResultadoOfensiva = {
  estado: EstadoOfensiva;
  /** `true` quando esta conclusao acendeu o dia (a primeira do dia). */
  subiu: boolean;
  /** Quantos congelamentos foram gastos para cobrir dias sem estudo. */
  congelamentosGastos: number;
  /** `true` quando a ofensiva zerou por falta de congelamento. */
  quebrou: boolean;
};

/** Dia local (YYYY-MM-DD) de um instante, no fuso pedido. */
export function diaLocal(agora: Date, fuso: string): string {
  // en-CA formata como YYYY-MM-DD, que ordena e compara como string.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/** Diferenca em dias entre duas datas locais YYYY-MM-DD. */
export function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Valida um fuso IANA. Fuso invalido vindo do cliente nao pode derrubar a rota. */
export function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/**
 * Aplica a conclusao de um tema sobre o estado da ofensiva.
 *
 * `agora` vem do relogio do servidor — nunca do cliente. E uma funcao pura para
 * o teste conseguir viajar no tempo sem mexer no relogio do processo.
 */
export function registrarConclusao(
  estado: EstadoOfensiva,
  agora: Date,
): ResultadoOfensiva {
  const hoje = diaLocal(agora, estado.fuso);
  const inalterado = { estado, subiu: false, congelamentosGastos: 0, quebrou: false };

  if (estado.ultimoDiaConcluido === hoje) {
    // Ja contou hoje. Estudar mais rende XP, mas nao move a ofensiva de novo.
    return inalterado;
  }

  const gap =
    estado.ultimoDiaConcluido === null
      ? null
      : diasEntre(estado.ultimoDiaConcluido, hoje);

  // Data futura guardada (fuso mudou, relogio do servidor voltou): nao mexe.
  if (gap !== null && gap < 0) return inalterado;

  let streak: number;
  let congelamentosGastos = 0;
  let quebrou = false;

  if (gap === null) {
    streak = 1;
  } else if (gap === 1) {
    streak = estado.streak + 1;
  } else {
    // Faltou `gap - 1` dia(s). Cada congelamento cobre um dia perdido.
    const diasPerdidos = gap - 1;
    if (estado.congelamentos >= diasPerdidos) {
      congelamentosGastos = diasPerdidos;
      streak = estado.streak + 1;
    } else {
      quebrou = true;
      streak = 1;
    }
  }

  return {
    estado: {
      ...estado,
      streak,
      maiorStreak: Math.max(estado.maiorStreak, streak),
      congelamentos: estado.congelamentos - congelamentosGastos,
      ultimoDiaConcluido: hoje,
    },
    subiu: true,
    congelamentosGastos,
    quebrou,
  };
}

/**
 * A ofensiva como ela deve APARECER agora, sem gravar nada.
 *
 * Quem concluiu ontem e ainda nao estudou hoje continua vendo o numero cheio
 * (o dia ainda nao acabou). Quem deixou passar o dia inteiro ja perdeu — a menos
 * que tenha congelamento sobrando para cobrir.
 */
export function ofensivaVisivel(estado: EstadoOfensiva, agora: Date): number {
  if (estado.ultimoDiaConcluido === null) return 0;
  const gap = diasEntre(estado.ultimoDiaConcluido, diaLocal(agora, estado.fuso));
  if (gap <= 1) return estado.streak;
  const diasPerdidos = gap - 1;
  return estado.congelamentos >= diasPerdidos ? estado.streak : 0;
}

/** `true` quando o dia de hoje ja esta garantido. */
export function diaFeito(estado: EstadoOfensiva, agora: Date): boolean {
  return estado.ultimoDiaConcluido === diaLocal(agora, estado.fuso);
}

export function proximoMarco(streak: number): number | null {
  return MARCOS.find((m) => m > streak) ?? null;
}
