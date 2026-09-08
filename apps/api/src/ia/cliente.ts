import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { calcularCusto, type Custo, type ModeloId } from './modelo.js';
import { extrairJSON } from './json.js';
import { PREAMBULO } from './prompts.js';

export type Esforco = 'low' | 'medium' | 'high';

export type PedidoGeracao<T> = {
  /** Bloco estavel: o material. Vai no fim do system, antes da tarefa. */
  material: string;
  /** Instrucao desta chamada. Vai no user, depois do prefixo estavel. */
  tarefa: string;
  esquema: z.ZodType<T>;
  /** Rotulo desta chamada no log de custo. */
  nomeEsquema: string;
  maxTokens?: number;
  esforco?: Esforco;
  /**
   * Marca o material para cache. So vale a pena quando OUTRA chamada com o
   * MESMO esquema vai reaproveitar o prefixo — escrever custa 1,25x, e uma
   * escrita sem leitura e dinheiro jogado fora.
   *
   * Medido em 08/09/2026: o esquema do structured output entra no prefixo
   * ANTES do system (a ordem e tools -> system -> messages), entao chamadas com
   * esquemas diferentes NAO compartilham cache, mesmo com material identico.
   * Por isso o cache e por familia de chamada, e nao do tema inteiro.
   */
  cachearMaterial?: boolean;
};

export type RespostaGeracao<T> = {
  dados: T;
  custo: Custo;
  /** `true` quando a chamada caiu no caminho de texto livre. */
  fallback: boolean;
};

export class ErroGeracao extends Error {
  constructor(
    message: string,
    readonly causa?: unknown,
  ) {
    super(message);
    this.name = 'ErroGeracao';
  }
}

export interface GeradorIA {
  gerar<T>(pedido: PedidoGeracao<T>): Promise<RespostaGeracao<T>>;
}

/** Erros que valem uma nova tentativa; um 400 nao vale. */
function ehTransitorio(erro: unknown): boolean {
  if (erro instanceof Anthropic.RateLimitError) return true;
  if (erro instanceof Anthropic.APIConnectionError) return true;
  if (erro instanceof Anthropic.APIError) return (erro.status ?? 0) >= 500;
  return false;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type OpcoesGerador = {
  modelo: ModeloId;
  cliente?: Anthropic;
  tentativas?: number;
  /** Emitido a cada chamada concluida, para log e telemetria de custo. */
  aoUsar?: (info: { custo: Custo; fallback: boolean; nomeEsquema: string }) => void;
};

export function criarGerador(opcoes: OpcoesGerador): GeradorIA {
  const cliente = opcoes.cliente ?? new Anthropic();
  const modelo = opcoes.modelo;
  const tentativas = opcoes.tentativas ?? 3;

  /**
   * O system carrega o preambulo (identico em toda chamada) e o material. Tudo
   * que varia por chamada fica no user, DEPOIS desse prefixo — e o que permite
   * a chamada seguinte da mesma familia ler o material do cache.
   *
   * O marcador de cache so entra quando quem chamou disse que ha uma segunda
   * chamada com o mesmo esquema para aproveitar. Ver `cachearMaterial`.
   */
  function montarSystem(material: string, cachear: boolean): Anthropic.TextBlockParam[] {
    return [
      { type: 'text', text: PREAMBULO },
      {
        type: 'text',
        text: material,
        ...(cachear ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
    ];
  }

  async function comRetentativa<T>(fn: () => Promise<T>): Promise<T> {
    let ultimo: unknown;
    for (let i = 0; i < tentativas; i += 1) {
      try {
        return await fn();
      } catch (erro) {
        ultimo = erro;
        if (!ehTransitorio(erro) || i === tentativas - 1) throw erro;
        await espera(2 ** i * 1000);
      }
    }
    throw ultimo;
  }

  async function gerar<T>(pedido: PedidoGeracao<T>): Promise<RespostaGeracao<T>> {
    const maxTokens = pedido.maxTokens ?? 8000;
    const comum = {
      model: modelo,
      max_tokens: maxTokens,
      system: montarSystem(pedido.material, pedido.cachearMaterial ?? false),
      output_config: { effort: pedido.esforco ?? 'medium' },
    } as const;

    // Caminho principal: structured output. O modelo nao tem como devolver algo
    // fora do esquema, o que elimina a maior fonte de falha do prototipo.
    try {
      const resposta = await comRetentativa(() =>
        cliente.messages.parse({
          ...comum,
          messages: [{ role: 'user', content: pedido.tarefa }],
          output_config: {
            ...comum.output_config,
            format: zodOutputFormat(pedido.esquema),
          },
        }),
      );

      const custo = calcularCusto(modelo, resposta.usage);
      if (resposta.parsed_output == null) {
        throw new ErroGeracao('A IA respondeu fora do esquema pedido.');
      }
      opcoes.aoUsar?.({ custo, fallback: false, nomeEsquema: pedido.nomeEsquema });
      return { dados: resposta.parsed_output as T, custo, fallback: false };
    } catch (erro) {
      // Um 400 aqui quase sempre significa "este esquema/modelo nao aceita
      // structured output". Nesse caso vale tentar em texto livre em vez de
      // derrubar a geracao inteira; qualquer outro erro sobe.
      if (!(erro instanceof Anthropic.BadRequestError) && !(erro instanceof ErroGeracao)) {
        throw erro;
      }
      return gerarPorTexto(pedido, comum, erro);
    }
  }

  async function gerarPorTexto<T>(
    pedido: PedidoGeracao<T>,
    comum: {
      model: ModeloId;
      max_tokens: number;
      system: Anthropic.TextBlockParam[];
      output_config: { effort: Esforco };
    },
    causaOriginal: unknown,
  ): Promise<RespostaGeracao<T>> {
    const esquemaJson = JSON.stringify(z.toJSONSchema(pedido.esquema));
    const instrucao =
      `${pedido.tarefa}\n\n` +
      'Responda APENAS com JSON valido que obedeca a este JSON Schema, sem ' +
      `markdown e sem texto fora do JSON:\n${esquemaJson}`;

    const resposta = await comRetentativa(() =>
      cliente.messages.create({
        ...comum,
        messages: [{ role: 'user', content: instrucao }],
      }),
    );

    const custo = calcularCusto(modelo, resposta.usage);
    const texto = resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    let bruto: unknown;
    try {
      bruto = extrairJSON(texto);
    } catch (erro) {
      throw new ErroGeracao('Nao consegui ler a resposta da IA como JSON.', erro);
    }

    const validado = pedido.esquema.safeParse(bruto);
    if (!validado.success) {
      throw new ErroGeracao(
        'A IA respondeu fora do esquema pedido, mesmo em texto livre.',
        causaOriginal,
      );
    }

    opcoes.aoUsar?.({ custo, fallback: true, nomeEsquema: pedido.nomeEsquema });
    return { dados: validado.data, custo, fallback: true };
  }

  return { gerar };
}
