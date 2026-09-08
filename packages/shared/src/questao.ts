import { z } from 'zod';

/**
 * Contrato de dados das questoes — portado do prototipo `estuda-ai-app.html`.
 *
 * Os nomes dos campos sao os mesmos do prototipo de proposito: o front ja sabe
 * renderizar essas formas, e mudar os nomes agora custaria retrabalho sem ganho.
 */

/** Os 7 tipos de questao fechados no handoff. */
export const TIPOS_QUESTAO = [
  'mc', // multipla escolha
  'tf', // verdadeiro ou falso
  'fill', // completar a frase
  'match', // ligar pares
  'cenario', // estudo de caso
  'calc', // calcular
  'ordenar', // colocar em ordem
] as const;

export type TipoQuestao = (typeof TIPOS_QUESTAO)[number];

/** Tipos que compartilham a forma "enunciado + alternativas + indice correto". */
export const TIPOS_ALTERNATIVAS = ['mc', 'calc', 'cenario'] as const;

/**
 * De onde a questao veio. As duas familias sao intercaladas na trilha:
 * `prova` treina para a avaliacao, `fixacao` grava o conteudo por repeticao ativa.
 */
export const FamiliaQuestao = z.enum(['prova', 'fixacao']);
export type FamiliaQuestao = z.infer<typeof FamiliaQuestao>;

const base = {
  id: z.string().min(1),
  familia: FamiliaQuestao,
  /** Conceitos que a questao cobra. Base da revisao espacada (erro por conceito). */
  tags: z.array(z.string().min(1)).default([]),
  explicacao: z.string().min(1),
};

export const QuestaoAlternativasSchema = z.object({
  ...base,
  tipo: z.enum(TIPOS_ALTERNATIVAS),
  /** So `cenario` usa: o caso apresentado antes do comando. */
  contexto: z.string().optional(),
  pergunta: z.string().min(1),
  opcoes: z.array(z.string().min(1)).min(2).max(6),
  correta: z.number().int().min(0),
});

export const QuestaoVfSchema = z.object({
  ...base,
  tipo: z.literal('tf'),
  pergunta: z.string().min(1),
  resposta: z.boolean(),
});

export const QuestaoLacunaSchema = z.object({
  ...base,
  tipo: z.literal('fill'),
  antes: z.string(),
  depois: z.string(),
  opcoes: z.array(z.string().min(1)).min(2).max(6),
  correta: z.number().int().min(0),
});

export const QuestaoParesSchema = z.object({
  ...base,
  tipo: z.literal('match'),
  pares: z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(2).max(5),
});

export const QuestaoOrdenarSchema = z.object({
  ...base,
  tipo: z.literal('ordenar'),
  instrucao: z.string().min(1),
  ordem_correta: z.array(z.string().min(1)).min(2).max(6),
});

/**
 * Uma questao valida do dominio. Discriminada por `tipo`, entao o cliente pode
 * dar `switch (q.tipo)` e receber os campos certos com tipo garantido.
 */
export const QuestaoSchema = z.discriminatedUnion('tipo', [
  QuestaoAlternativasSchema,
  QuestaoVfSchema,
  QuestaoLacunaSchema,
  QuestaoParesSchema,
  QuestaoOrdenarSchema,
]);

export type Questao = z.infer<typeof QuestaoSchema>;
export type QuestaoAlternativas = z.infer<typeof QuestaoAlternativasSchema>;
export type QuestaoVf = z.infer<typeof QuestaoVfSchema>;
export type QuestaoLacuna = z.infer<typeof QuestaoLacunaSchema>;
export type QuestaoPares = z.infer<typeof QuestaoParesSchema>;
export type QuestaoOrdenar = z.infer<typeof QuestaoOrdenarSchema>;

/**
 * Corrige a resposta de uma questao. E a mesma regra que o prototipo aplicava
 * no cliente, mas mora aqui para o servidor poder pontuar sem confiar no app.
 *
 * `match` nao entra: o proprio jogo de ligar pares so avanca quando todos os
 * pares batem, entao acertar e a unica saida possivel.
 */
export function corrigir(questao: Questao, resposta: unknown): boolean {
  switch (questao.tipo) {
    case 'mc':
    case 'calc':
    case 'cenario':
    case 'fill':
      return resposta === questao.correta;
    case 'tf':
      return resposta === questao.resposta;
    case 'match':
      return true;
    case 'ordenar':
      return (
        Array.isArray(resposta) &&
        resposta.length === questao.ordem_correta.length &&
        resposta.every((v, i) => v === questao.ordem_correta[i])
      );
  }
}
