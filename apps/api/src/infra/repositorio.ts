import type { Materia, Plano, Questao, Tema } from '@estudaai/shared';
import type { EstadoOfensiva } from '@estudaai/shared';

/**
 * Persistencia.
 *
 * A implementacao de hoje e em memoria: some quando o processo reinicia. Ela
 * existe para o backend de geracao poder ser exercitado de ponta a ponta antes
 * de o banco entrar. A interface e a costura — trocar por Postgres significa
 * escrever outra classe que a implemente, sem tocar nas rotas.
 *
 * O modelo relacional correspondente esta em `docs/ARQUITETURA.md`.
 */

export type Usuario = {
  id: string;
  plano: Plano;
  /** Questoes geradas no mes corrente (`AAAA-MM`), para a cota. */
  cota: { competencia: string; questoesUsadas: number };
  ofensiva: EstadoOfensiva;
  xp: number;
  /** Ids de temas ja concluidos. */
  concluidos: string[];
};

export interface Repositorio {
  obterUsuario(id: string, fuso: string): Promise<Usuario>;
  salvarUsuario(usuario: Usuario): Promise<void>;
  listarMaterias(usuarioId: string): Promise<Materia[]>;
  obterMateria(usuarioId: string, materiaId: string): Promise<Materia | null>;
  salvarMateria(usuarioId: string, materia: Materia): Promise<void>;
  /** O texto do material fica fora da materia: e grande e so o servidor usa. */
  obterBlocos(usuarioId: string, materiaId: string): Promise<string[] | null>;
  salvarBlocos(usuarioId: string, materiaId: string, blocos: string[]): Promise<void>;
}

function usuarioNovo(id: string, fuso: string): Usuario {
  return {
    id,
    plano: 'livre',
    cota: { competencia: competenciaAtual(), questoesUsadas: 0 },
    ofensiva: {
      streak: 0,
      maiorStreak: 0,
      congelamentos: 2,
      ultimoDiaConcluido: null,
      fuso,
    },
    xp: 0,
    concluidos: [],
  };
}

export function competenciaAtual(agora = new Date()): string {
  return agora.toISOString().slice(0, 7);
}

export class RepositorioMemoria implements Repositorio {
  private usuarios = new Map<string, Usuario>();
  private materias = new Map<string, Map<string, Materia>>();
  private blocos = new Map<string, string[]>();

  async obterUsuario(id: string, fuso: string): Promise<Usuario> {
    let usuario = this.usuarios.get(id);
    if (!usuario) {
      usuario = usuarioNovo(id, fuso);
      this.usuarios.set(id, usuario);
    }
    // O fuso pode mudar de viagem; a data guardada continua valendo.
    if (fuso && usuario.ofensiva.fuso !== fuso) {
      usuario.ofensiva = { ...usuario.ofensiva, fuso };
    }
    // Virou o mes: a cota reinicia.
    const competencia = competenciaAtual();
    if (usuario.cota.competencia !== competencia) {
      usuario.cota = { competencia, questoesUsadas: 0 };
    }
    return usuario;
  }

  async salvarUsuario(usuario: Usuario): Promise<void> {
    this.usuarios.set(usuario.id, usuario);
  }

  async listarMaterias(usuarioId: string): Promise<Materia[]> {
    return [...(this.materias.get(usuarioId)?.values() ?? [])].sort((a, b) =>
      b.criadaEm.localeCompare(a.criadaEm),
    );
  }

  async obterMateria(usuarioId: string, materiaId: string): Promise<Materia | null> {
    return this.materias.get(usuarioId)?.get(materiaId) ?? null;
  }

  async salvarMateria(usuarioId: string, materia: Materia): Promise<void> {
    let doUsuario = this.materias.get(usuarioId);
    if (!doUsuario) {
      doUsuario = new Map();
      this.materias.set(usuarioId, doUsuario);
    }
    doUsuario.set(materia.id, materia);
  }

  async obterBlocos(usuarioId: string, materiaId: string): Promise<string[] | null> {
    return this.blocos.get(`${usuarioId}:${materiaId}`) ?? null;
  }

  async salvarBlocos(usuarioId: string, materiaId: string, blocos: string[]): Promise<void> {
    this.blocos.set(`${usuarioId}:${materiaId}`, blocos);
  }
}

/** Aplica a trilha gerada no tema, preservando o resto da materia. */
export function comTemaGerado(
  materia: Materia,
  temaId: string,
  trilha: { aula: Tema['aula']; questoes: Questao[] },
): Materia {
  return {
    ...materia,
    temas: materia.temas.map((t) =>
      t.id === temaId ? { ...t, aula: trilha.aula, questoes: trilha.questoes } : t,
    ),
  };
}
