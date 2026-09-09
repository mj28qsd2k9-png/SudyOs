import Anthropic from '@anthropic-ai/sdk';

/**
 * Traducao de falha da IA para algo acionavel.
 *
 * A versao anterior devolvia "A geracao falhou agora. Tenta de novo." para tudo
 * que nao fosse um caso conhecido — inclusive para saldo insuficiente, que
 * nenhuma tentativa no mundo vai resolver. Esconder a causa nao protege
 * ninguem: so impede o dono do app de consertar o que esta quebrado.
 */

export type CodigoErro =
  | 'sem_credito'
  | 'chave_invalida'
  | 'sem_permissao'
  | 'modelo_indisponivel'
  | 'material_grande'
  | 'sobrecarga'
  | 'sem_conexao'
  | 'esquema_recusado'
  | 'resposta_invalida'
  | 'material_sem_temas'
  | 'poucas_questoes'
  | 'desconhecido';

export type ErroDescrito = {
  codigo: CodigoErro;
  /** Texto que pode ir para a tela do aluno. */
  mensagem: string;
  /** `true` quando repetir a mesma acao tem chance real de funcionar. */
  adiantaTentarDeNovo: boolean;
  /** Mensagem crua da API, para o log e para o dono do app. */
  detalhe?: string;
};

/** Texto do erro como a API o descreveu, sem o ruido do wrapper do SDK. */
export function detalheDaApi(erro: unknown): string | undefined {
  if (!(erro instanceof Anthropic.APIError)) return undefined;
  const corpo = erro.error as { error?: { message?: string } } | undefined;
  return corpo?.error?.message ?? erro.message;
}

/**
 * Um 400 pode ser muita coisa. So vale cair para texto livre quando o problema
 * e o structured output; nos outros casos o fallback so gasta outra chamada
 * para falhar igual.
 */
export function ehRecusaDeEsquema(erro: unknown): boolean {
  if (!(erro instanceof Anthropic.BadRequestError)) return false;
  const texto = (detalheDaApi(erro) ?? '').toLowerCase();
  if (!texto) return true; // 400 sem explicacao: tenta o outro caminho.
  const pistas = ['output_config', 'output format', 'schema', 'structured output', 'json_schema'];
  return pistas.some((p) => texto.includes(p));
}

export function descreverErro(erro: unknown): ErroDescrito {
  const detalhe = detalheDaApi(erro);
  const texto = (detalhe ?? '').toLowerCase();

  if (erro instanceof Anthropic.AuthenticationError) {
    return {
      codigo: 'chave_invalida',
      mensagem: 'A chave da API da Anthropic esta ausente ou invalida no servidor.',
      adiantaTentarDeNovo: false,
      detalhe,
    };
  }

  if (erro instanceof Anthropic.PermissionDeniedError) {
    return {
      codigo: 'sem_permissao',
      mensagem: 'A chave nao tem permissao para usar este modelo.',
      adiantaTentarDeNovo: false,
      detalhe,
    };
  }

  if (erro instanceof Anthropic.NotFoundError) {
    return {
      codigo: 'modelo_indisponivel',
      mensagem: 'O modelo configurado em MODELO_IA nao existe ou nao esta disponivel para esta chave.',
      adiantaTentarDeNovo: false,
      detalhe,
    };
  }

  if (erro instanceof Anthropic.RateLimitError) {
    return {
      codigo: 'sobrecarga',
      mensagem: 'A IA esta sobrecarregada agora. Tenta daqui a pouco.',
      adiantaTentarDeNovo: true,
      detalhe,
    };
  }

  if (erro instanceof Anthropic.APIConnectionError) {
    return {
      codigo: 'sem_conexao',
      mensagem: 'O servidor nao conseguiu falar com a API da Anthropic.',
      adiantaTentarDeNovo: true,
      detalhe,
    };
  }

  if (erro instanceof Anthropic.BadRequestError) {
    // Saldo zerado chega como 400, nao como 402. Sem esta faixa, o dono do app
    // ve "tenta de novo" e repete para sempre uma chamada que nunca vai passar.
    if (texto.includes('credit') || texto.includes('balance') || texto.includes('quota')) {
      return {
        codigo: 'sem_credito',
        mensagem:
          'A conta da Anthropic esta sem credito. Recarregue em console.anthropic.com para gerar.',
        adiantaTentarDeNovo: false,
        detalhe,
      };
    }
    if (texto.includes('too long') || texto.includes('too large') || texto.includes('max_tokens')) {
      return {
        codigo: 'material_grande',
        mensagem: 'O trecho enviado a IA ficou grande demais. Divida o material em partes menores.',
        adiantaTentarDeNovo: false,
        detalhe,
      };
    }
    return {
      codigo: 'esquema_recusado',
      mensagem: 'A API recusou o formato do pedido.',
      adiantaTentarDeNovo: false,
      detalhe,
    };
  }

  if (erro instanceof Anthropic.APIError && (erro.status ?? 0) >= 500) {
    return {
      codigo: 'sobrecarga',
      mensagem: 'A IA esta instavel agora. Tenta daqui a pouco.',
      adiantaTentarDeNovo: true,
      detalhe,
    };
  }

  return {
    codigo: 'desconhecido',
    mensagem: 'A geracao falhou. Veja o log do servidor para a causa.',
    adiantaTentarDeNovo: true,
    detalhe: erro instanceof Error ? erro.message : String(erro),
  };
}
