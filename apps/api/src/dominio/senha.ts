import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * `promisify(scrypt)` escolhe a sobrecarga de 3 argumentos e perde as opcoes de
 * custo, que sao justamente o ponto. Entao a promessa e montada a mao.
 */
function scryptAsync(
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    scrypt(senha, sal, tamanho, opcoes, (erro, chave) =>
      erro ? rejeitar(erro) : resolver(chave),
    );
  });
}

/**
 * Hash de senha com scrypt, do proprio Node.
 *
 * scrypt e uma KDF cara de proposito: custa memoria, o que torna ataque por
 * forca bruta com GPU muito mais caro do que com um hash rapido. bcrypt e
 * argon2 fariam o mesmo servico, mas sao modulos nativos que precisam compilar;
 * scrypt vem no Node e nao adiciona nada ao deploy.
 *
 * Formato guardado: `scrypt$N$r$p$sal$hash`, tudo em base64url. Guardar os
 * parametros junto e o que permite endurecer o custo depois sem invalidar as
 * senhas ja cadastradas — a verificacao le os parametros de cada registro.
 */

// N=16384 pede ~16 MB por verificacao. Sobe conforme o servidor aguentar.
const N = 16_384;
const R = 8;
const P = 1;
const TAMANHO_HASH = 32;
const TAMANHO_SAL = 16;

/** Abaixo disso nao vale chamar de senha. */
export const MINIMO_SENHA = 8;
export const MAXIMO_SENHA = 200;

function derivar(
  senha: string,
  sal: Buffer,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  // `maxmem` precisa acompanhar N*r*128, senao o Node recusa com ERR_CRYPTO.
  return scryptAsync(senha.normalize('NFKC'), sal, TAMANHO_HASH, {
    N: n,
    r,
    p,
    maxmem: 256 * n * r,
  });
}

export async function guardarSenha(senha: string): Promise<string> {
  const sal = randomBytes(TAMANHO_SAL);
  const hash = await derivar(senha, sal, N, R, P);
  return ['scrypt', N, R, P, sal.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const n = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const sal = Buffer.from(partes[4]!, 'base64url');
  const esperado = Buffer.from(partes[5]!, 'base64url');
  if (sal.length === 0 || esperado.length !== TAMANHO_HASH) return false;

  const obtido = await derivar(senha, sal, n, r, p);
  // Comparacao de tempo constante: comparar com === vaza, pelo tempo de
  // resposta, quantos bytes iniciais bateram.
  return timingSafeEqual(obtido, esperado);
}

/** `true` quando o registro foi feito com custo menor do que o de hoje. */
export function precisaRehash(guardado: string): boolean {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return true;
  return Number(partes[1]) < N || Number(partes[2]) < R || Number(partes[3]) < P;
}
