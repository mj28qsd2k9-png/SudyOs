/**
 * Cota do plano. Decisoes do handoff: tema padrao = 20 questoes,
 * plano basico = 80 questoes/mes, distribuidas pelo usuario como quiser.
 *
 * No prototipo a cota estava desligada ("modo livre") porque o dono era o
 * usuario zero. Aqui ela existe de verdade, mas o plano `livre` mantem esse
 * comportamento — e o plano usado ate a assinatura entrar.
 */
export const QUESTOES_POR_TEMA = 20;

export const PLANOS = {
  livre: { nome: 'Modo livre', questoesPorMes: Infinity },
  basico: { nome: 'Basico', questoesPorMes: 80 },
} as const;

export type Plano = keyof typeof PLANOS;

export function cotaDoPlano(plano: Plano): number {
  return PLANOS[plano].questoesPorMes;
}

/** Quantos temas ainda cabem no que sobrou da cota do mes. */
export function temasRestantes(plano: Plano, questoesUsadas: number): number {
  const total = cotaDoPlano(plano);
  if (total === Infinity) return Infinity;
  return Math.max(0, Math.floor((total - questoesUsadas) / QUESTOES_POR_TEMA));
}
