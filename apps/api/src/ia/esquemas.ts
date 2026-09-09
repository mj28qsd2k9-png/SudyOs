import { z } from 'zod';

/**
 * Esquemas dos structured outputs.
 *
 * Sao PLANOS de proposito: todo campo existe em toda questao, e a IA preenche
 * com vazio o que nao se aplica ao tipo. Uniao discriminada seria mais bonita,
 * mas gera `anyOf` no JSON Schema, e schema plano com todos os campos
 * obrigatorios e a forma que o modo estrito aceita sem discussao. A conversao
 * para o tipo de dominio (discriminado de verdade) acontece em `normalizar.ts`.
 */

export const OutlineSchema = z.object({
  nome: z.string().describe('Nome da materia identificada no documento'),
  temas: z
    .array(
      z.object({
        nome: z.string().describe('Nome do tema'),
        conceito: z.string().describe('1 a 2 frases suas situando o tema'),
        chave: z
          .array(z.string())
          .describe('3 a 5 palavras-chave que localizam este tema no material'),
      }),
    )
    .describe('Temas cobrindo o documento inteiro, na ordem do material'),
});
export type OutlineBruto = z.infer<typeof OutlineSchema>;

export const AulaGeradaSchema = z.object({
  blocos: z
    .array(
      z.object({
        titulo: z.string(),
        texto: z.string().describe('2 a 4 frases'),
      }),
    )
    .describe('3 a 4 blocos curtos, do basico para o especifico'),
  resumo: z.array(z.string()).describe('3 pontos-chave curtos'),
});
export type AulaBruta = z.infer<typeof AulaGeradaSchema>;

const camposComuns = {
  explicacao: z.string().describe('Explicacao curta e didatica, ate 20 palavras'),
  tags: z
    .array(z.string())
    .describe('1 a 3 conceitos que a questao cobra, para a revisao espacada'),
};

export const QuestaoProvaSchema = z.object({
  tipo: z.enum(['mc', 'cenario']),
  contexto: z
    .string()
    .describe('So para tipo "cenario": o caso apresentado. Use "" para "mc".'),
  pergunta: z
    .string()
    .describe('Texto-base contextualizado seguido do comando da questao'),
  opcoes: z.array(z.string()).describe('5 alternativas plausiveis, so uma correta'),
  correta: z.number().int().describe('Indice (base 0) da alternativa correta'),
  ...camposComuns,
});

export const LoteProvaSchema = z.object({
  questoes: z.array(QuestaoProvaSchema),
});
export type LoteProva = z.infer<typeof LoteProvaSchema>;

export const QuestaoFixacaoSchema = z.object({
  tipo: z.enum(['fill', 'match', 'ordenar', 'tf']),
  pergunta: z.string().describe('So para "tf": a afirmacao. Use "" nos outros tipos.'),
  resposta: z.boolean().describe('So para "tf": se a afirmacao e verdadeira.'),
  antes: z.string().describe('So para "fill": o texto antes da lacuna.'),
  depois: z.string().describe('So para "fill": o texto depois da lacuna.'),
  opcoes: z
    .array(z.string())
    .describe('So para "fill": 3 alternativas. Use [] nos outros tipos.'),
  correta: z.number().int().describe('So para "fill": indice (base 0) da correta.'),
  pares: z
    .array(z.object({ termo: z.string(), definicao: z.string() }))
    .describe('So para "match": 3 pares termo/definicao. Use [] nos outros tipos.'),
  instrucao: z.string().describe('So para "ordenar": o comando. Use "" nos outros.'),
  ordem_correta: z
    .array(z.string())
    .describe('So para "ordenar": os itens na ordem certa. Use [] nos outros tipos.'),
  ...camposComuns,
});

export const LoteFixacaoSchema = z.object({
  questoes: z.array(QuestaoFixacaoSchema),
});
export type LoteFixacao = z.infer<typeof LoteFixacaoSchema>;

export type QuestaoBruta =
  | z.infer<typeof QuestaoProvaSchema>
  | z.infer<typeof QuestaoFixacaoSchema>;
