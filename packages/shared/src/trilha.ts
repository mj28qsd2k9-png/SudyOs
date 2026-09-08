import { z } from 'zod';
import { AulaSchema } from './aula.js';
import { QuestaoSchema } from './questao.js';

/**
 * Um tema e a unidade de geracao (decisao fechada no handoff): uma materia tem
 * ~5 temas, cada tema vira uma trilha de aula + exercicios.
 */
export const TemaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  /** Uma ou duas frases que situam o tema antes de o aluno entrar. */
  conceito: z.string().default(''),
  /** Palavras-chave usadas para achar o trecho do material que fala deste tema. */
  chave: z.array(z.string()).default([]),
  /** `null` enquanto o tema ainda nao foi gerado (custa cota gerar). */
  aula: AulaSchema.nullable().default(null),
  questoes: z.array(QuestaoSchema).nullable().default(null),
});

export const MateriaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  cor: z.string().default('#E8501A'),
  criadaEm: z.string(),
  temas: z.array(TemaSchema),
});

export type Tema = z.infer<typeof TemaSchema>;
export type Materia = z.infer<typeof MateriaSchema>;

/** Tema pronto para jogar: aula e questoes garantidamente presentes. */
export type TemaGerado = Tema & {
  aula: NonNullable<Tema['aula']>;
  questoes: NonNullable<Tema['questoes']>;
};

export function temaFoiGerado(tema: Tema): tema is TemaGerado {
  return tema.aula !== null && tema.questoes !== null && tema.questoes.length > 0;
}
