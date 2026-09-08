import type { FastifyRequest } from 'fastify';
import { fusoValido } from '@estudaai/shared';

/**
 * Identificacao do usuario.
 *
 * PROVISORIO: hoje o id vem de um cabecalho, sem verificacao nenhuma. Isso e
 * suficiente para desenvolver a geracao, e e exatamente o ponto onde a
 * autenticacao entra depois (validar o token e extrair o `sub`). Todo o resto do
 * codigo ja trata o id como se fosse confiavel, entao trocar isto e a unica
 * mudanca necessaria.
 */
export const FUSO_PADRAO = 'America/Sao_Paulo';

export type Identidade = { usuarioId: string; fuso: string };

export function identificar(req: FastifyRequest): Identidade {
  const bruto = req.headers['x-usuario-id'];
  const usuarioId = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim() || 'usuario-zero';

  const fusoBruto = req.headers['x-fuso'];
  const fuso = (Array.isArray(fusoBruto) ? fusoBruto[0] : fusoBruto)?.trim() ?? '';

  return { usuarioId, fuso: fuso && fusoValido(fuso) ? fuso : FUSO_PADRAO };
}
