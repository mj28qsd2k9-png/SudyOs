import type { Termo } from './trilha.js';

/**
 * Onde os termos do glossario aparecem dentro de um texto.
 *
 * Regra pura, e por isso mora aqui: e a mesma marcacao na aula, no enunciado e
 * na explicacao da correcao — e da para testar sem montar tela nenhuma.
 *
 * Duas decisoes que a versao ingenua (um `replace` por termo) erra:
 *
 * - **Palavra inteira.** Sem a fronteira, "ativo" acende dentro de "ativos",
 *   de "passivo" e de "inativo", e o texto vira um campo minado de
 *   sublinhados. Casa sem acento e sem caixa, porque o material escreve
 *   "Provisão" e o glossario devolve "provisao".
 * - **Uma marcacao por termo.** Acender a mesma palavra cinco vezes no mesmo
 *   paragrafo e ruido; a dica so precisa estar ao alcance uma vez.
 *
 * Termos mais longos ganham dos curtos, para "ativo circulante" nao ser comido
 * por "ativo".
 */

export type PedacoDeTexto = { texto: string; termo: Termo | null };

function semAcento(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Tamanho minimo de um termo destacavel: menos que isso e sigla solta. */
const MIN_TERMO = 3;

export function fatiarPorTermos(texto: string, termos: Termo[]): PedacoDeTexto[] {
  if (!texto || termos.length === 0) return [{ texto, termo: null }];

  const ordenados = [...termos].sort((a, b) => b.termo.length - a.termo.length);
  const alvo = semAcento(texto);

  // `NFD` pode mudar o tamanho da string, e as posicoes precisam valer no texto
  // original. Se mudou, nao ha como mapear com seguranca — melhor nao marcar
  // nada do que marcar no lugar errado.
  if (alvo.length !== texto.length) return [{ texto, termo: null }];

  const ocupado = new Array<boolean>(texto.length).fill(false);
  const achados: { inicio: number; fim: number; termo: Termo }[] = [];

  for (const t of ordenados) {
    const busca = semAcento(t.termo.trim());
    if (busca.length < MIN_TERMO) continue;

    const padrao = new RegExp(`(^|[^a-z0-9])(${escaparRegex(busca)})(?![a-z0-9])`, 'g');
    let achado: RegExpExecArray | null;
    while ((achado = padrao.exec(alvo)) !== null) {
      const inicio = achado.index + achado[1]!.length;
      const fim = inicio + achado[2]!.length;
      if (ocupado.slice(inicio, fim).some(Boolean)) continue;
      for (let i = inicio; i < fim; i += 1) ocupado[i] = true;
      achados.push({ inicio, fim, termo: t });
      break;
    }
  }

  if (achados.length === 0) return [{ texto, termo: null }];
  achados.sort((a, b) => a.inicio - b.inicio);

  const pedacos: PedacoDeTexto[] = [];
  let cursor = 0;
  for (const a of achados) {
    if (a.inicio > cursor) pedacos.push({ texto: texto.slice(cursor, a.inicio), termo: null });
    pedacos.push({ texto: texto.slice(a.inicio, a.fim), termo: a.termo });
    cursor = a.fim;
  }
  if (cursor < texto.length) pedacos.push({ texto: texto.slice(cursor), termo: null });
  return pedacos;
}
