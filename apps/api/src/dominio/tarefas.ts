import { randomUUID } from 'node:crypto';

/**
 * Geracao como tarefa em segundo plano.
 *
 * Gerar um tema leva de 1 a 2 minutos e sao varias chamadas de IA. Segurar uma
 * requisicao HTTP aberta esse tempo todo funciona no navegador com Wi-Fi e
 * quebra no celular: basta o 4G oscilar para o aluno perder o trabalho que ja
 * foi pago. Com tarefa, a conexao pode cair — o servidor continua, e o app
 * pergunta o estado quando voltar.
 */

export type EstadoTarefa = 'na_fila' | 'rodando' | 'concluida' | 'falhou';

export type FalhaTarefa = {
  mensagem: string;
  codigo: string;
  adiantaTentarDeNovo: boolean;
};

export type Tarefa = {
  id: string;
  usuarioId: string;
  estado: EstadoTarefa;
  /** Texto para a tela de espera, na lingua do aluno. */
  etapa: string;
  /** 0 a 1. E estimativa honesta: as etapas nao duram o mesmo tanto. */
  progresso: number;
  criadaEm: string;
  concluidaEm?: string;
  resultado?: {
    materiaId: string;
    temaId: string | null;
    custoUSD: number;
    /** Recado para a tela: algo importante que o aluno precisa saber. */
    aviso?: string;
  };
  falha?: FalhaTarefa;
};

export class FilaTarefas {
  private tarefas = new Map<string, Tarefa>();

  criar(usuarioId: string, etapa: string): Tarefa {
    const tarefa: Tarefa = {
      id: randomUUID(),
      usuarioId,
      estado: 'na_fila',
      etapa,
      progresso: 0,
      criadaEm: new Date().toISOString(),
    };
    this.tarefas.set(tarefa.id, tarefa);
    return tarefa;
  }

  /** So devolve a tarefa para quem a criou. */
  obter(id: string, usuarioId: string): Tarefa | null {
    const tarefa = this.tarefas.get(id);
    if (!tarefa || tarefa.usuarioId !== usuarioId) return null;
    return tarefa;
  }

  andar(id: string, etapa: string, progresso: number): void {
    const tarefa = this.tarefas.get(id);
    if (!tarefa) return;
    tarefa.estado = 'rodando';
    tarefa.etapa = etapa;
    // Nunca deixa a barra andar para tras: assusta mais do que informa.
    tarefa.progresso = Math.max(tarefa.progresso, Math.min(1, progresso));
  }

  concluir(id: string, resultado: NonNullable<Tarefa['resultado']>): void {
    const tarefa = this.tarefas.get(id);
    if (!tarefa) return;
    tarefa.estado = 'concluida';
    tarefa.etapa = 'Pronto';
    tarefa.progresso = 1;
    tarefa.resultado = resultado;
    tarefa.concluidaEm = new Date().toISOString();
  }

  falhar(id: string, falha: FalhaTarefa): void {
    const tarefa = this.tarefas.get(id);
    if (!tarefa) return;
    tarefa.estado = 'falhou';
    tarefa.etapa = 'Falhou';
    tarefa.falha = falha;
    tarefa.concluidaEm = new Date().toISOString();
  }

  /**
   * Roda o trabalho fora da requisicao.
   *
   * O `catch` nao e opcional: uma rejeicao nao tratada aqui derruba o processo
   * inteiro no Node, e uma geracao que falhou nao pode levar o servidor junto.
   */
  executar(id: string, trabalho: () => Promise<NonNullable<Tarefa['resultado']>>,
           aoFalhar: (erro: unknown) => FalhaTarefa): void {
    void (async () => {
      try {
        this.concluir(id, await trabalho());
      } catch (erro) {
        this.falhar(id, aoFalhar(erro));
      }
    })();
  }

  /** Remove tarefas velhas para a memoria nao crescer sem limite. */
  limpar(maxIdadeMs = 60 * 60 * 1000, agora = Date.now()): number {
    let removidas = 0;
    for (const [id, t] of this.tarefas) {
      const fim = t.concluidaEm ?? t.criadaEm;
      if (agora - Date.parse(fim) > maxIdadeMs) {
        this.tarefas.delete(id);
        removidas += 1;
      }
    }
    return removidas;
  }
}
