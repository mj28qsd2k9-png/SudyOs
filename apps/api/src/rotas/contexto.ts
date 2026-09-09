import type { FastifyReply, FastifyRequest } from 'fastify';
import { fusoValido } from '@estudaai/shared';
import {
  hashDoToken,
  RENOVAR_APOS_MS,
  sessaoExpirou,
  tokenDoCabecalho,
  VALIDADE_SESSAO_MS,
} from '../dominio/autenticacao.js';
import type { Repositorio } from '../infra/repositorio.js';

/**
 * Identificacao do usuario, agora de verdade.
 *
 * O id vem da sessao guardada no banco, achada pelo hash do token que o cliente
 * mandou em `Authorization: Bearer`. Antes vinha de um cabecalho que qualquer
 * um podia escrever; o resto do codigo ja tratava esse id como confiavel, e
 * agora ele e.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';

export type Identidade = { usuarioId: string; fuso: string };

/** O fuso e do cliente mesmo — ele so diz onde esta, nao que dia e hoje. */
export function fusoDaRequisicao(req: FastifyRequest): string {
  const bruto = req.headers['x-fuso'];
  const fuso = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim() ?? '';
  return fuso && fusoValido(fuso) ? fuso : FUSO_PADRAO;
}

declare module 'fastify' {
  interface FastifyRequest {
    identidade?: Identidade;
  }
}

/**
 * Exige sessao valida. Registrado como `preHandler` nas rotas protegidas — e
 * nao dentro de cada uma, para nao existir a possibilidade de esquecer numa.
 */
export function exigirSessao(repo: Repositorio) {
  return async function guarda(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = tokenDoCabecalho(req.headers.authorization);
    if (!token) {
      return reply.code(401).send({ erro: 'Faça login para continuar.', codigo: 'sem_sessao' });
    }

    const sessao = await repo.obterSessao(hashDoToken(token));
    if (!sessao) {
      return reply.code(401).send({ erro: 'Sessão inválida.', codigo: 'sessao_invalida' });
    }

    const agora = new Date();
    if (sessaoExpirou(sessao, agora)) {
      // Some com ela na hora: sessao vencida so ocupa espaco e confunde log.
      await repo.apagarSessao(sessao.tokenHash);
      return reply.code(401).send({ erro: 'Sua sessão expirou.', codigo: 'sessao_expirada' });
    }

    // Renova por uso, mas nao a cada requisicao — seria uma escrita no banco
    // por chamada, incluindo as de polling da geracao.
    if (agora.getTime() - Date.parse(sessao.ultimoUso) > RENOVAR_APOS_MS) {
      await repo.renovarSessao(
        sessao.tokenHash,
        new Date(agora.getTime() + VALIDADE_SESSAO_MS).toISOString(),
        agora.toISOString(),
      );
    }

    req.identidade = { usuarioId: sessao.usuarioId, fuso: fusoDaRequisicao(req) };
  };
}

/**
 * Le a identidade que o guarda ja colocou na requisicao.
 *
 * Lanca se nao houver: significa rota protegida sem o `preHandler`, que e bug
 * de montagem — e falhar alto e melhor do que servir dados de ninguem.
 */
export function identificar(req: FastifyRequest): Identidade {
  if (!req.identidade) {
    throw new Error('Rota sem exigirSessao: identidade ausente.');
  }
  return req.identidade;
}
