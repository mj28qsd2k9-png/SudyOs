import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { criarGerador, ErroGeracao } from '../src/ia/cliente.js';
import { PREAMBULO } from '../src/ia/prompts.js';

const Esquema = z.object({ nome: z.string(), itens: z.array(z.string()) });
const RESPOSTA = { nome: 'Biologia', itens: ['a', 'b'] };
const USO = { input_tokens: 100, output_tokens: 50 };

function um400() {
  return new Anthropic.BadRequestError(400, undefined, 'schema nao suportado', new Headers());
}

function textoDe(conteudo: string) {
  return { content: [{ type: 'text', text: conteudo }], usage: USO };
}

function clienteFalso(messages: Record<string, unknown>) {
  return { messages } as unknown as Anthropic;
}

const pedido = {
  material: 'CONTEUDO: um texto qualquer do material.',
  tarefa: 'Faca alguma coisa.',
  esquema: Esquema,
  nomeEsquema: 'teste',
};

describe('criarGerador', () => {
  it('usa structured output e monta o prefixo cacheavel', async () => {
    const parse = vi.fn().mockResolvedValue({ parsed_output: RESPOSTA, usage: USO });
    const gerador = criarGerador({
      modelo: 'claude-sonnet-5',
      cliente: clienteFalso({ parse, create: vi.fn() }),
    });

    const r = await gerador.gerar(pedido);
    expect(r.dados).toEqual(RESPOSTA);
    expect(r.fallback).toBe(false);

    const enviado = parse.mock.calls[0]![0] as Record<string, any>;
    // O preambulo vem primeiro e o material por ultimo; a tarefa, que muda a
    // cada chamada, fica DEPOIS desse prefixo — e o que torna o prefixo estavel.
    expect(enviado['system'][0].text).toBe(PREAMBULO);
    expect(enviado['system'][1].text).toBe(pedido.material);
    expect(enviado['messages'][0].content).toBe(pedido.tarefa);
  });

  it('so marca o material para cache quando pedem', async () => {
    // Escrever cache custa 1,25x. Sem uma segunda chamada do MESMO esquema para
    // ler de volta, marcar so faz a conta subir — foi o que aconteceu na
    // primeira geracao real, com a aula e o mapa escrevendo cache a toa.
    const parse = vi.fn().mockResolvedValue({ parsed_output: RESPOSTA, usage: USO });
    const gerador = criarGerador({
      modelo: 'claude-sonnet-5',
      cliente: clienteFalso({ parse, create: vi.fn() }),
    });

    await gerador.gerar(pedido);
    expect((parse.mock.calls[0]![0] as any).system[1].cache_control).toBeUndefined();

    await gerador.gerar({ ...pedido, cachearMaterial: true });
    expect((parse.mock.calls[1]![0] as any).system[1].cache_control).toEqual({
      type: 'ephemeral',
    });
  });

  it('cai para texto livre quando o structured output nao e aceito', async () => {
    const parse = vi.fn().mockRejectedValue(um400());
    const create = vi.fn().mockResolvedValue(
      textoDe('Claro!\n```json\n' + JSON.stringify(RESPOSTA) + '\n```'),
    );
    const gerador = criarGerador({
      modelo: 'claude-sonnet-5',
      cliente: clienteFalso({ parse, create }),
    });

    const r = await gerador.gerar(pedido);
    expect(r.dados).toEqual(RESPOSTA);
    expect(r.fallback).toBe(true);
    // No fallback o esquema vai descrito no texto da tarefa.
    expect((create.mock.calls[0]![0] as any).messages[0].content).toContain('JSON Schema');
  });

  it('nao aceita resposta fora do esquema nem no fallback', async () => {
    const gerador = criarGerador({
      modelo: 'claude-sonnet-5',
      cliente: clienteFalso({
        parse: vi.fn().mockRejectedValue(um400()),
        create: vi.fn().mockResolvedValue(textoDe('{"nome": 42}')),
      }),
    });
    await expect(gerador.gerar(pedido)).rejects.toBeInstanceOf(ErroGeracao);
  });

  it('tenta de novo em erro transitorio e desiste em erro de requisicao', async () => {
    const transitorio = new Anthropic.RateLimitError(429, undefined, 'devagar', new Headers());
    const parse = vi
      .fn()
      .mockRejectedValueOnce(transitorio)
      .mockResolvedValue({ parsed_output: RESPOSTA, usage: USO });

    const gerador = criarGerador({
      modelo: 'claude-sonnet-5',
      cliente: clienteFalso({ parse, create: vi.fn() }),
      tentativas: 2,
    });

    vi.useFakeTimers();
    const promessa = gerador.gerar(pedido);
    await vi.runAllTimersAsync();
    await expect(promessa).resolves.toMatchObject({ dados: RESPOSTA });
    vi.useRealTimers();
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('deixa erro de autenticacao subir em vez de mascarar', async () => {
    const gerador = criarGerador({
      modelo: 'claude-sonnet-5',
      cliente: clienteFalso({
        parse: vi
          .fn()
          .mockRejectedValue(
            new Anthropic.AuthenticationError(401, undefined, 'chave invalida', new Headers()),
          ),
        create: vi.fn(),
      }),
    });
    await expect(gerador.gerar(pedido)).rejects.toBeInstanceOf(Anthropic.AuthenticationError);
  });

  it('reporta o custo da chamada', async () => {
    const aoUsar = vi.fn();
    const gerador = criarGerador({
      modelo: 'claude-sonnet-5',
      cliente: clienteFalso({
        parse: vi.fn().mockResolvedValue({
          parsed_output: RESPOSTA,
          usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        }),
        create: vi.fn(),
      }),
      aoUsar,
    });

    const r = await gerador.gerar(pedido);
    // Sonnet 5: US$ 2/M de entrada + US$ 10/M de saida.
    expect(r.custo.totalUSD).toBeCloseTo(12, 6);
    expect(aoUsar).toHaveBeenCalledWith(
      expect.objectContaining({ fallback: false, nomeEsquema: 'teste' }),
    );
  });
});
