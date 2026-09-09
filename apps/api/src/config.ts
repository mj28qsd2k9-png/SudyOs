import { z } from 'zod';
import { QUESTOES_POR_TEMA } from '@estudaai/shared';
import { ehModeloConhecido, MODELO_PADRAO, type ModeloId } from './ia/modelo.js';

const Ambiente = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  /** A chave nunca sai daqui. E a razao de este backend existir. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  MODELO_IA: z
    .string()
    .default(MODELO_PADRAO)
    .refine(ehModeloConhecido, { message: 'Modelo desconhecido' }),
  QUESTOES_POR_TEMA: z.coerce.number().int().min(4).max(40).default(QUESTOES_POR_TEMA),
  /** Origens liberadas no CORS. Vazio = libera tudo (so faz sentido em dev). */
  CORS_ORIGENS: z.string().default(''),
  /** Arquivo do banco. `:memory:` some no restart e so serve para teste. */
  BANCO: z.string().default('./dados/estudaai.db'),
});

export type Config = {
  ambiente: 'development' | 'test' | 'production';
  porta: number;
  host: string;
  temChave: boolean;
  modelo: ModeloId;
  questoesPorTema: number;
  corsOrigens: string[];
  banco: string;
};

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const bruto = Ambiente.parse(env);
  return {
    ambiente: bruto.NODE_ENV,
    porta: bruto.PORT,
    host: bruto.HOST,
    temChave: Boolean(bruto.ANTHROPIC_API_KEY),
    modelo: bruto.MODELO_IA as ModeloId,
    questoesPorTema: bruto.QUESTOES_POR_TEMA,
    corsOrigens: bruto.CORS_ORIGENS.split(',').map((s) => s.trim()).filter(Boolean),
    // Em teste o banco e descartavel por padrao: teste que deixa arquivo para
    // tras contamina a proxima rodada.
    banco: bruto.NODE_ENV === 'test' ? ':memory:' : bruto.BANCO,
  };
}
