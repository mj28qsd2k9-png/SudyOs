import type { Materia, Plano, Questao, Tema } from '@estudaai/shared';
import type { EstadoOfensiva } from '@estudaai/shared';
import type { Sessao } from '../dominio/autenticacao.js';

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

/** Credencial de acesso. A senha nunca aparece aqui — so o hash. */
export type Credencial = {
  usuarioId: string;
  email: string;
  senhaHash: string;
  criadaEm: string;
};

export interface Repositorio {
  obterUsuario(id: string, fuso: string): Promise<Usuario>;
  criarUsuario(usuario: Usuario): Promise<void>;
  salvarUsuario(usuario: Usuario): Promise<void>;
  listarMaterias(usuarioId: string): Promise<Materia[]>;
  obterMateria(usuarioId: string, materiaId: string): Promise<Materia | null>;
  salvarMateria(usuarioId: string, materia: Materia): Promise<void>;
  /** O texto do material fica fora da materia: e grande e so o servidor usa. */
  obterBlocos(usuarioId: string, materiaId: string): Promise<string[] | null>;
  salvarBlocos(usuarioId: string, materiaId: string, blocos: string[]): Promise<void>;

  // --- autenticacao ---
  obterCredencialPorEmail(email: string): Promise<Credencial | null>;
  obterCredencialPorUsuario(usuarioId: string): Promise<Credencial | null>;
  salvarCredencial(credencial: Credencial): Promise<void>;

  criarSessao(sessao: Sessao): Promise<void>;
  obterSessao(tokenHash: string): Promise<Sessao | null>;
  renovarSessao(tokenHash: string, expiraEm: string, ultimoUso: string): Promise<void>;
  apagarSessao(tokenHash: string): Promise<void>;
  apagarSessoesDoUsuario(usuarioId: string): Promise<void>;
  /** Remove sessoes vencidas. Devolve quantas saiu. */
  limparSessoesVencidas(agora: Date): Promise<number>;

  /**
   * Passa tudo de um usuario para outro. Serve para o aluno que usou o app sem
   * conta e depois se cadastrou: sem isto, a primeira coisa que ele faria
   * depois de criar a conta seria perder as materias que gerou.
   */
  transferirDados(deId: string, paraId: string): Promise<void>;
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
  private credenciais = new Map<string, Credencial>();
  private sessoes = new Map<string, Sessao>();

  async criarUsuario(usuario: Usuario): Promise<void> {
    this.usuarios.set(usuario.id, usuario);
  }

  async obterCredencialPorEmail(email: string): Promise<Credencial | null> {
    return this.credenciais.get(email) ?? null;
  }

  async obterCredencialPorUsuario(usuarioId: string): Promise<Credencial | null> {
    return [...this.credenciais.values()].find((c) => c.usuarioId === usuarioId) ?? null;
  }

  async salvarCredencial(credencial: Credencial): Promise<void> {
    this.credenciais.set(credencial.email, credencial);
  }

  async criarSessao(sessao: Sessao): Promise<void> {
    this.sessoes.set(sessao.tokenHash, sessao);
  }

  async obterSessao(tokenHash: string): Promise<Sessao | null> {
    return this.sessoes.get(tokenHash) ?? null;
  }

  async renovarSessao(tokenHash: string, expiraEm: string, ultimoUso: string): Promise<void> {
    const s = this.sessoes.get(tokenHash);
    if (s) this.sessoes.set(tokenHash, { ...s, expiraEm, ultimoUso });
  }

  async apagarSessao(tokenHash: string): Promise<void> {
    this.sessoes.delete(tokenHash);
  }

  async apagarSessoesDoUsuario(usuarioId: string): Promise<void> {
    for (const [k, s] of this.sessoes) if (s.usuarioId === usuarioId) this.sessoes.delete(k);
  }

  async limparSessoesVencidas(agora: Date): Promise<number> {
    let n = 0;
    for (const [k, s] of this.sessoes) {
      if (Date.parse(s.expiraEm) <= agora.getTime()) {
        this.sessoes.delete(k);
        n += 1;
      }
    }
    return n;
  }

  async transferirDados(deId: string, paraId: string): Promise<void> {
    const doOrigem = this.materias.get(deId);
    if (doOrigem) {
      const destino = this.materias.get(paraId) ?? new Map<string, Materia>();
      for (const [id, m] of doOrigem) destino.set(id, m);
      this.materias.set(paraId, destino);
      this.materias.delete(deId);
    }
    for (const [chave, valor] of [...this.blocos]) {
      if (chave.startsWith(`${deId}:`)) {
        this.blocos.set(chave.replace(`${deId}:`, `${paraId}:`), valor);
        this.blocos.delete(chave);
      }
    }
  }

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
  trilha: { aula: Tema['aula']; questoes: Questao[]; glossario?: Tema['glossario'] },
): Materia {
  return {
    ...materia,
    temas: materia.temas.map((t) =>
      t.id === temaId
        ? {
            ...t,
            aula: trilha.aula,
            questoes: trilha.questoes,
            glossario: trilha.glossario ?? t.glossario,
          }
        : t,
    ),
  };
}
