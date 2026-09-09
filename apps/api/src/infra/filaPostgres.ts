import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { FalhaTarefa, Fila, Tarefa } from '../dominio/tarefas.js';

/**
 * Fila de tarefas no banco.
 *
 * A fila em memoria basta enquanto o servidor e um processo so. Em serverless
 * cada requisicao pode cair numa instancia diferente: o aluno criaria a tarefa
 * numa instancia e perguntaria o estado noutra, tomando 404 numa geracao que
 * esta correndo bem. Com o estado no banco, qualquer instancia responde.
 *
 * ESTADO: escrito e compilando, mas ainda NAO ligado nem exercitado contra um
 * Postgres de verdade. Ver `repositorioPostgres.ts`.
 */
export class FilaPostgres implements Fila {
  constructor(private pool: Pool) {}

  async criar(usuarioId: string, etapa: string): Promise<Tarefa> {
    const tarefa: Tarefa = {
      id: randomUUID(),
      usuarioId,
      estado: 'na_fila',
      etapa,
      progresso: 0,
      criadaEm: new Date().toISOString(),
    };
    await this.pool.query(
      `INSERT INTO tarefas (id, usuario_id, estado, etapa, progresso, criada_em)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tarefa.id, usuarioId, tarefa.estado, etapa, 0, tarefa.criadaEm],
    );
    return tarefa;
  }

  async obter(id: string, usuarioId: string): Promise<Tarefa | null> {
    const r = await this.pool.query(
      'SELECT * FROM tarefas WHERE id = $1 AND usuario_id = $2',
      [id, usuarioId],
    );
    const l = r.rows[0] as
      | {
          id: string;
          usuario_id: string;
          estado: Tarefa['estado'];
          etapa: string;
          progresso: number;
          criada_em: Date;
          concluida_em: Date | null;
          resultado: Tarefa['resultado'] | null;
          falha: FalhaTarefa | null;
        }
      | undefined;
    if (!l) return null;

    return {
      id: l.id,
      usuarioId: l.usuario_id,
      estado: l.estado,
      etapa: l.etapa,
      progresso: Number(l.progresso),
      criadaEm: new Date(l.criada_em).toISOString(),
      ...(l.concluida_em ? { concluidaEm: new Date(l.concluida_em).toISOString() } : {}),
      ...(l.resultado ? { resultado: l.resultado } : {}),
      ...(l.falha ? { falha: l.falha } : {}),
    };
  }

  async andar(id: string, etapa: string, progresso: number): Promise<void> {
    // O GREATEST faz o mesmo que a fila em memoria: barra de progresso que anda
    // para tras assusta mais do que informa. Aqui a garantia e do banco, porque
    // duas instancias podem escrever fora de ordem.
    await this.pool.query(
      `UPDATE tarefas
          SET estado = 'rodando', etapa = $1, progresso = GREATEST(progresso, $2)
        WHERE id = $3`,
      [etapa, Math.min(1, Math.max(0, progresso)), id],
    );
  }

  async concluir(id: string, resultado: NonNullable<Tarefa['resultado']>): Promise<void> {
    await this.pool.query(
      `UPDATE tarefas
          SET estado = 'concluida', etapa = 'Pronto', progresso = 1,
              resultado = $1, concluida_em = $2
        WHERE id = $3`,
      [JSON.stringify(resultado), new Date().toISOString(), id],
    );
  }

  async falhar(id: string, falha: FalhaTarefa): Promise<void> {
    await this.pool.query(
      `UPDATE tarefas
          SET estado = 'falhou', etapa = 'Falhou', falha = $1, concluida_em = $2
        WHERE id = $3`,
      [JSON.stringify(falha), new Date().toISOString(), id],
    );
  }

  async limpar(maxIdadeMs = 60 * 60 * 1000, agora = Date.now()): Promise<number> {
    const corte = new Date(agora - maxIdadeMs).toISOString();
    const r = await this.pool.query(
      'DELETE FROM tarefas WHERE COALESCE(concluida_em, criada_em) <= $1',
      [corte],
    );
    return r.rowCount ?? 0;
  }
}
