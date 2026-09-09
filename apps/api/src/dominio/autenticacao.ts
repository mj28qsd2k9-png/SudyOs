import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Sessoes com token opaco.
 *
 * Nao e JWT de proposito. JWT nao da para revogar sem uma lista de bloqueio —
 * que e um banco de sessoes com outro nome — e obriga a cuidar de chave de
 * assinatura e de algoritmo. Um token aleatorio guardado no banco revoga na
 * hora, some no "sair de todos os aparelhos" e nao tem armadilha de algoritmo.
 *
 * O que fica guardado e o SHA-256 do token, nunca o token. Vazamento do banco
 * nao entrega sessao de ninguem, pela mesma razao que nao se guarda senha crua.
 */

/** 90 dias: app de habito diario nao pode pedir login toda semana. */
export const VALIDADE_SESSAO_MS = 90 * 24 * 60 * 60 * 1000;

/** A cada uso a validade e esticada, se ja tiver passado disto. */
export const RENOVAR_APOS_MS = 24 * 60 * 60 * 1000;

export type Sessao = {
  tokenHash: string;
  usuarioId: string;
  criadaEm: string;
  expiraEm: string;
  ultimoUso: string;
};

export function novoToken(): { token: string; hash: string } {
  // 32 bytes de aleatoriedade criptografica: nao da para adivinhar nem enumerar.
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashDoToken(token) };
}

export function hashDoToken(token: string): string {
  // SHA-256 basta aqui: o token ja tem 256 bits de entropia, entao nao ha o que
  // forcar por dicionario — o motivo de usar KDF cara em senha nao se aplica.
  return createHash('sha256').update(token).digest('hex');
}

export function novoUsuarioId(): string {
  return randomUUID();
}

export function sessaoExpirou(sessao: Sessao, agora: Date): boolean {
  return Date.parse(sessao.expiraEm) <= agora.getTime();
}

/** Extrai o token do cabecalho `Authorization: Bearer <token>`. */
export function tokenDoCabecalho(valor: string | string[] | undefined): string | null {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (!bruto) return null;
  const [esquema, token] = bruto.split(/\s+/);
  if (!esquema || esquema.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * E-mail normalizado.
 *
 * Sem isto, "Ana@Gmail.com " e "ana@gmail.com" viram duas contas e o aluno
 * jura que perdeu os dados.
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), { message: 'E-mail invalido' });

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
