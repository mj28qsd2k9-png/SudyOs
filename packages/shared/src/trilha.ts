import { z } from 'zod';
import { AulaSchema } from './aula.js';
import { QuestaoSchema } from './questao.js';

/**
 * Um termo tecnico do tema, com o significado em uma frase.
 *
 * E a dica de palavra do Duolingo trazida para ca, e para apostila de
 * faculdade ela pesa mais do que para idioma: "regime de competencia" ou
 * "realizavel a longo prazo" sao as palavras em que o aluno para de ler. A
 * definicao e curta de proposito — quem esta no meio de um exercicio quer
 * destravar, nao estudar um segundo assunto.
 */
export const TermoSchema = z.object({
  termo: z.string().min(1),
  significado: z.string().min(1),
});
export type Termo = z.infer<typeof TermoSchema>;

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
  /**
   * Termos tecnicos deste tema. Vem junto com a aula, na mesma chamada de IA —
   * glossario nao custa geracao nenhuma, so alguns tokens de saida.
   */
  glossario: z.array(TermoSchema).default([]),
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
