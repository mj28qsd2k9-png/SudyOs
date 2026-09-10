import type { GeradorIA, PedidoGeracao, RespostaGeracao } from '../../src/ia/cliente.js';
import type { Custo } from '../../src/ia/modelo.js';

const CUSTO_ZERO: Custo = {
  entradaUSD: 0,
  saidaUSD: 0,
  totalUSD: 0,
  tokensEntrada: 0,
  tokensSaida: 0,
  tokensCacheEscrito: 0,
  tokensCacheLido: 0,
  tokensPensamento: 0,
};

let sequencia = 0;

/** Le do texto da tarefa quantas questoes foram pedidas naquele lote. */
function quantidadePedida(tarefa: string): number {
  const m = /(\d+)\s+(?:questoes|exercicios)/.exec(tarefa);
  return m ? Number(m[1]) : 5;
}

function respostaPara(pedido: PedidoGeracao<unknown>): unknown {
  switch (pedido.nomeEsquema) {
    case 'mapa_do_material':
      return {
        nome: 'Biologia Celular',
        temas: [
          { nome: 'Membrana plasmatica', conceito: 'A porteira da celula.', chave: ['membrana'] },
          { nome: 'Nucleo e DNA', conceito: 'O cofre da celula.', chave: ['nucleo', 'dna'] },
        ],
      };

    case 'aula':
      return {
        blocos: [
          { titulo: 'O que e', texto: 'A membrana envolve a celula e separa o dentro do fora.' },
          { titulo: 'Como funciona', texto: 'Ela escolhe o que entra e o que sai.' },
        ],
        resumo: ['Membrana = porteira', 'Seletivamente permeavel'],
        glossario: [
          {
            termo: 'permeabilidade seletiva',
            significado: 'A membrana deixa passar umas coisas e barra outras.',
          },
          { termo: 'ATP', significado: 'A moeda de energia que a celula gasta.' },
          // Entra pelo pedido mas nao pode sobreviver a poda: definicao curta
          // demais e termo repetido sao os defeitos que o glossario tem na vida real.
          { termo: 'x', significado: 'nao vale nada' },
          { termo: 'ATP', significado: 'Repetido, tem que sumir na poda.' },
        ],
      };

    case 'questoes_de_prova':
      return {
        questoes: Array.from({ length: quantidadePedida(pedido.tarefa) }, () => {
          sequencia += 1;
          return {
            tipo: 'mc',
            contexto: '',
            pergunta: `Questao de prova numero ${sequencia}. Assinale a correta.`,
            opcoes: ['alfa', 'beta', 'gama', 'delta', 'epsilon'],
            correta: sequencia % 5,
            explicacao: 'Porque a alternativa descreve o processo corretamente.',
            tags: ['membrana'],
          };
        }),
      };

    case 'exercicios_de_fixacao':
      return {
        questoes: Array.from({ length: quantidadePedida(pedido.tarefa) }, () => {
          sequencia += 1;
          return {
            tipo: 'tf',
            pergunta: `Afirmacao de fixacao numero ${sequencia}.`,
            resposta: sequencia % 2 === 0,
            antes: '',
            depois: '',
            opcoes: [],
            correta: 0,
            pares: [],
            instrucao: '',
            ordem_correta: [],
            explicacao: 'Explicacao curta do porque.',
            tags: ['membrana'],
          };
        }),
      };

    default:
      throw new Error(`esquema inesperado: ${pedido.nomeEsquema}`);
  }
}

/**
 * Gerador de mentira para os testes de rota: devolve dados validos sem rede.
 * Registra as chamadas para o teste poder afirmar sobre a ORDEM delas — e a
 * ordem que faz o cache do material valer alguma coisa.
 */
export function criarGeradorFalso(opcoes: { falharEm?: string[] } = {}) {
  const chamadas: { nome: string; material: string; tarefa: string }[] = [];
  const falharEm = new Set(opcoes.falharEm ?? []);

  const gerador: GeradorIA = {
    async gerar<T>(pedido: PedidoGeracao<T>): Promise<RespostaGeracao<T>> {
      chamadas.push({
        nome: pedido.nomeEsquema,
        material: pedido.material,
        tarefa: pedido.tarefa,
      });
      if (falharEm.has(pedido.nomeEsquema)) {
        throw new Error(`falha simulada em ${pedido.nomeEsquema}`);
      }
      return { dados: respostaPara(pedido) as T, custo: CUSTO_ZERO, fallback: false };
    },
  };

  return { gerador, chamadas };
}
