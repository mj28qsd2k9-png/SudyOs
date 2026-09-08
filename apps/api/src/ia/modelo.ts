/**
 * Modelos e custo.
 *
 * Decisao do handoff: Sonnet 5 e o padrao (equilibrio qualidade/custo), Haiku
 * 4.5 e a opcao mais barata. Opus 5 fica disponivel para comparar qualidade
 * quando estivermos afinando os prompts.
 */

export const MODELOS = {
  'claude-sonnet-5': { entrada: 2, saida: 10 },
  'claude-haiku-4-5': { entrada: 1, saida: 5 },
  'claude-opus-5': { entrada: 5, saida: 25 },
} as const satisfies Record<string, { entrada: number; saida: number }>;

export type ModeloId = keyof typeof MODELOS;

export const MODELO_PADRAO: ModeloId = 'claude-sonnet-5';

export function ehModeloConhecido(id: string): id is ModeloId {
  return id in MODELOS;
}

/**
 * Prefixo minimo para o cache pegar, por modelo (em tokens). Abaixo disso a
 * API simplesmente nao cria a entrada — sem erro, sem aviso.
 */
export const MINIMO_CACHE_TOKENS: Record<ModeloId, number> = {
  'claude-sonnet-5': 1024,
  'claude-haiku-4-5': 4096,
  'claude-opus-5': 512,
};

export type Uso = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  /** Parte da saida gasta em raciocinio; cobrada como saida. */
  output_tokens_details?: { thinking_tokens?: number | null } | null;
};

export type Custo = {
  entradaUSD: number;
  saidaUSD: number;
  totalUSD: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheEscrito: number;
  tokensCacheLido: number;
  /** Quanto da saida foi raciocinio. E o alvo do `effort` quando a conta aperta. */
  tokensPensamento: number;
};

/**
 * Custo de uma chamada em USD.
 * Cache: leitura custa 0,1x a entrada; escrita custa 1,25x (TTL de 5 min).
 */
export function calcularCusto(modelo: ModeloId, uso: Uso): Custo {
  const preco = MODELOS[modelo];
  const porMilhao = 1_000_000;

  const tokensEntrada = uso.input_tokens ?? 0;
  const tokensSaida = uso.output_tokens ?? 0;
  const tokensCacheEscrito = uso.cache_creation_input_tokens ?? 0;
  const tokensCacheLido = uso.cache_read_input_tokens ?? 0;
  const tokensPensamento = uso.output_tokens_details?.thinking_tokens ?? 0;

  const entradaUSD =
    (tokensEntrada * preco.entrada +
      tokensCacheEscrito * preco.entrada * 1.25 +
      tokensCacheLido * preco.entrada * 0.1) /
    porMilhao;
  const saidaUSD = (tokensSaida * preco.saida) / porMilhao;

  return {
    entradaUSD,
    saidaUSD,
    totalUSD: entradaUSD + saidaUSD,
    tokensEntrada,
    tokensSaida,
    tokensCacheEscrito,
    tokensCacheLido,
    tokensPensamento,
  };
}

export function somarCustos(custos: Custo[]): Custo {
  return custos.reduce<Custo>(
    (acc, c) => ({
      entradaUSD: acc.entradaUSD + c.entradaUSD,
      saidaUSD: acc.saidaUSD + c.saidaUSD,
      totalUSD: acc.totalUSD + c.totalUSD,
      tokensEntrada: acc.tokensEntrada + c.tokensEntrada,
      tokensSaida: acc.tokensSaida + c.tokensSaida,
      tokensCacheEscrito: acc.tokensCacheEscrito + c.tokensCacheEscrito,
      tokensCacheLido: acc.tokensCacheLido + c.tokensCacheLido,
      tokensPensamento: acc.tokensPensamento + c.tokensPensamento,
    }),
    {
      entradaUSD: 0,
      saidaUSD: 0,
      totalUSD: 0,
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensCacheEscrito: 0,
      tokensCacheLido: 0,
      tokensPensamento: 0,
    },
  );
}
