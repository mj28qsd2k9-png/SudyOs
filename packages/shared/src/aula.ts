import { z } from 'zod';

/**
 * A aula que abre cada tema. Pedagogia fechada no handoff: ensinar primeiro,
 * cobrar depois — o aluno nunca cai direto no exercicio.
 */
export const BlocoAulaSchema = z.object({
  titulo: z.string().min(1),
  texto: z.string().min(1),
});

export const AulaSchema = z.object({
  blocos: z.array(BlocoAulaSchema).min(1).max(6),
  resumo: z.array(z.string().min(1)).max(5).default([]),
});

export type BlocoAula = z.infer<typeof BlocoAulaSchema>;
export type Aula = z.infer<typeof AulaSchema>;
