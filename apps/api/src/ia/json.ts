/**
 * Extracao tolerante de JSON — portada do prototipo.
 *
 * So entra em acao no caminho de fallback, quando a resposta veio como texto
 * livre em vez de structured output. O prototipo aprendeu na pratica que a
 * resposta pode vir cercada de markdown ou cortada no meio, e que aproveitar os
 * objetos completos e melhor do que descartar o lote inteiro.
 */

/** Primeiro objeto ou array JSON completo do texto. */
export function extrairJSON(texto: string): unknown {
  const inicioObjeto = texto.indexOf('{');
  const inicioArray = texto.indexOf('[');
  const inicio =
    inicioArray >= 0 && (inicioArray < inicioObjeto || inicioObjeto < 0)
      ? inicioArray
      : inicioObjeto;
  const fim = Math.max(texto.lastIndexOf('}'), texto.lastIndexOf(']'));
  if (inicio < 0 || fim < inicio) throw new Error('Nenhum JSON encontrado na resposta');
  return JSON.parse(texto.slice(inicio, fim + 1));
}

/**
 * Todos os objetos JSON de nivel superior do texto, um a um.
 *
 * Varre respeitando strings e escapes, entao uma chave dentro de um texto nao
 * confunde a contagem. Um objeto cortado no fim simplesmente nao fecha e fica
 * de fora — os anteriores continuam valendo.
 */
export function extrairObjetos(texto: string): unknown[] {
  const objetos: unknown[] = [];
  let profundidade = 0;
  let inicio = -1;
  let dentroDeString = false;
  let escapado = false;

  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    if (dentroDeString) {
      if (escapado) escapado = false;
      else if (ch === '\\') escapado = true;
      else if (ch === '"') dentroDeString = false;
      continue;
    }
    if (ch === '"') {
      dentroDeString = true;
    } else if (ch === '{') {
      if (profundidade === 0) inicio = i;
      profundidade += 1;
    } else if (ch === '}' && profundidade > 0) {
      profundidade -= 1;
      if (profundidade === 0 && inicio >= 0) {
        try {
          objetos.push(JSON.parse(texto.slice(inicio, i + 1)));
        } catch {
          // Objeto malformado: segue para o proximo.
        }
        inicio = -1;
      }
    }
  }

  return objetos;
}
