import type { FamiliaQuestao, Questao } from '@estudaai/shared';
import { QuestaoSchema } from '@estudaai/shared';

/**
 * Converte a questao crua da IA no tipo de dominio, ou devolve `null`.
 *
 * Descartar em silencio e proposital: o prototipo ja aprendeu que e melhor
 * aproveitar as questoes boas de um lote e jogar fora as quebradas do que
 * falhar o tema inteiro por causa de uma resposta cortada. Quem chama decide se
 * o que sobrou e suficiente.
 */

let contador = 0;
function novoId(): string {
  contador += 1;
  return `q${Date.now().toString(36)}${contador.toString(36)}`;
}

/** Aceita numero, string numerica ou nada. */
function indice(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isInteger(valor)) return valor;
  if (typeof valor === 'string') {
    const n = Number.parseInt(valor, 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** A IA as vezes manda "verdadeiro"/"V"/"sim" no lugar de um booleano. */
function booleano(valor: unknown): boolean | null {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') {
    if (/^(true|verdadeiro|v|sim)$/i.test(valor.trim())) return true;
    if (/^(false|falso|f|nao|não)$/i.test(valor.trim())) return false;
  }
  return null;
}

function textos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((v) => String(v ?? '').trim()).filter((s) => s.length > 0);
}

/** `[["a","b"]]` (protocolo do prototipo) ou `[{termo,definicao}]` (esquema novo). */
function pares(valor: unknown): [string, string][] {
  if (!Array.isArray(valor)) return [];
  const saida: [string, string][] = [];
  for (const item of valor) {
    if (Array.isArray(item) && item.length === 2) {
      const [a, b] = [String(item[0] ?? '').trim(), String(item[1] ?? '').trim()];
      if (a && b) saida.push([a, b]);
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const a = String(o['termo'] ?? '').trim();
      const b = String(o['definicao'] ?? '').trim();
      if (a && b) saida.push([a, b]);
    }
  }
  return saida;
}

/**
 * `true` quando a palavra da resposta ja aparece no texto ao redor da lacuna.
 *
 * So vale para palavras com algum corpo: numa frase e normal repetir "de" ou
 * "da", e recusar por isso jogaria fora exercicio bom.
 */
function respostaVazada(resposta: string, antes: string, depois: string): boolean {
  const alvo = semAcentoMinusculo(resposta);
  if (alvo.length < 4) return false;
  const redor = `${semAcentoMinusculo(antes)} ${semAcentoMinusculo(depois)}`;
  return new RegExp(`(^|[^a-z0-9])${escaparRegex(alvo)}([^a-z0-9]|$)`).test(redor);
}

function semAcentoMinusculo(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizarQuestao(bruta: unknown, familia: FamiliaQuestao): Questao | null {
  if (!bruta || typeof bruta !== 'object') return null;
  const q = bruta as Record<string, unknown>;

  const tipo = String(q['tipo'] ?? '').toLowerCase().trim();
  const explicacao = String(q['explicacao'] ?? '').trim();
  if (!explicacao) return null;

  const comum = { id: novoId(), familia, tags: textos(q['tags']).slice(0, 3), explicacao };

  let candidata: unknown;

  if (tipo === 'mc' || tipo === 'calc' || tipo === 'cenario') {
    const opcoes = textos(q['opcoes']);
    const correta = indice(q['correta']);
    const pergunta = String(q['pergunta'] ?? '').trim();
    if (!pergunta || opcoes.length < 2 || correta === null) return null;
    if (correta < 0 || correta >= opcoes.length) return null;
    const contexto = String(q['contexto'] ?? '').trim();
    candidata = {
      ...comum,
      tipo,
      pergunta,
      opcoes,
      correta,
      ...(tipo === 'cenario' && contexto ? { contexto } : {}),
    };
  } else if (tipo === 'tf') {
    const pergunta = String(q['pergunta'] ?? '').trim();
    const resposta = booleano(q['resposta']);
    if (!pergunta || resposta === null) return null;
    candidata = { ...comum, tipo, pergunta, resposta };
  } else if (tipo === 'fill') {
    const opcoes = textos(q['opcoes']);
    const correta = indice(q['correta']);
    if (opcoes.length < 2 || correta === null) return null;
    if (correta < 0 || correta >= opcoes.length) return null;
    const antes = String(q['antes'] ?? '');
    const depois = String(q['depois'] ?? '');
    // Lacuna sem nenhum texto ao redor nao da para ler na tela.
    if (!antes.trim() && !depois.trim()) return null;
    // A resposta escrita na propria frase entrega a questao e ainda deixa a
    // frase errada: "ESG significa environmental, social and ___ governance"
    // com resposta "governance" completa para "...and governance governance".
    // Visto numa apostila de verdade em 09/09/2026.
    if (respostaVazada(opcoes[correta]!, antes, depois)) return null;
    candidata = { ...comum, tipo, antes, depois, opcoes, correta };
  } else if (tipo === 'match') {
    const p = pares(q['pares']);
    if (p.length < 2) return null;
    candidata = { ...comum, tipo, pares: p.slice(0, 5) };
  } else if (tipo === 'ordenar') {
    const ordem = textos(q['ordem_correta']);
    const instrucao = String(q['instrucao'] ?? '').trim();
    if (ordem.length < 2 || !instrucao) return null;
    // Itens repetidos tornam a ordem ambigua: nao da para corrigir com justica.
    if (new Set(ordem).size !== ordem.length) return null;
    candidata = { ...comum, tipo, instrucao, ordem_correta: ordem.slice(0, 6) };
  } else {
    return null;
  }

  const resultado = QuestaoSchema.safeParse(candidata);
  return resultado.success ? resultado.data : null;
}

/** Chave de deduplicacao: mesmo enunciado, mesma questao. */
function chave(q: Questao): string {
  switch (q.tipo) {
    case 'mc':
    case 'calc':
    case 'cenario':
    case 'tf':
      return q.pergunta.toLowerCase().slice(0, 80);
    case 'fill':
      return `${q.antes}|${q.depois}`.toLowerCase().slice(0, 80);
    case 'match':
      return q.pares.map((p) => p[0]).join('|').toLowerCase().slice(0, 80);
    case 'ordenar':
      return q.ordem_correta.join('|').toLowerCase().slice(0, 80);
  }
}

export function deduplicar(questoes: Questao[]): Questao[] {
  const vistas = new Set<string>();
  const saida: Questao[] = [];
  for (const q of questoes) {
    const k = chave(q);
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(q);
  }
  return saida;
}

/**
 * Intercala prova e fixacao, comecando pela fixacao.
 *
 * O aluno acabou de ler a aula: os primeiros exercicios sao os leves, que
 * gravam o termo, e so depois vem a questao de prova. Alternar tambem evita a
 * sequencia de cinco multiplas escolhas seguidas, que cansa.
 */
export function intercalar(questoes: Questao[]): Questao[] {
  const fixacao = questoes.filter((q) => q.familia === 'fixacao');
  const prova = questoes.filter((q) => q.familia === 'prova');
  const saida: Questao[] = [];
  for (let i = 0; i < Math.max(fixacao.length, prova.length); i += 1) {
    const f = fixacao[i];
    const p = prova[i];
    if (f) saida.push(f);
    if (p) saida.push(p);
  }
  return saida;
}
