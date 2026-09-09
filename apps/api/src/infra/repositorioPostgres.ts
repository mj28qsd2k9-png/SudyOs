import { Pool, type PoolClient } from 'pg';
import { MateriaSchema, type Materia, type Plano } from '@estudaai/shared';
import type { Sessao } from '../dominio/autenticacao.js';
import { competenciaAtual, type Credencial, type Repositorio, type Usuario } from './repositorio.js';

/**
 * Persistencia em Postgres.
 *
 * Existe porque SQLite grava em disco, e em serverless (Vercel) o disco e
 * efemero: as contas e as materias do aluno sumiriam entre uma requisicao e
 * outra. Mesma interface do repositorio de SQLite — as rotas nao sabem qual
 * das duas esta rodando.
 *
 * As tabelas seguem o mesmo desenho: a materia vai como JSON numa coluna,
 * validada pelo contrato Zod na leitura. Normalizar temas e questoes so paga a
 * pena quando houver consulta por questao, que chega com a revisao espacada.
 *
 * ESTADO: escrito e compilando, mas ainda NAO ligado nem exercitado contra um
 * Postgres de verdade — nada no app o instancia hoje. Ele existe porque o disco
 * do serverless e efemero e essa era a peca que faltava para o deploy; quando o
 * deploy entrar, ligue-o e rode os testes do repositorio contra ele antes de
 * confiar.
 */

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  plano TEXT NOT NULL DEFAULT 'livre',
  xp INTEGER NOT NULL DEFAULT 0,
  fuso TEXT NOT NULL,
  competencia TEXT NOT NULL,
  questoes_usadas INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  maior_streak INTEGER NOT NULL DEFAULT 0,
  congelamentos INTEGER NOT NULL DEFAULT 2,
  ultimo_dia_concluido TEXT,
  concluidos JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS materias (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  criada_em TIMESTAMPTZ NOT NULL,
  dados JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materias_usuario ON materias (usuario_id, criada_em DESC);

CREATE TABLE IF NOT EXISTS materiais (
  materia_id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  blocos JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS credenciais (
  usuario_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  criada_em TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credenciais_email ON credenciais (email);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  criada_em TIMESTAMPTZ NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  ultimo_uso TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes (expira_em);

CREATE TABLE IF NOT EXISTS tarefas (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  estado TEXT NOT NULL,
  etapa TEXT NOT NULL,
  progresso REAL NOT NULL DEFAULT 0,
  criada_em TIMESTAMPTZ NOT NULL,
  concluida_em TIMESTAMPTZ,
  resultado JSONB,
  falha JSONB
);
CREATE INDEX IF NOT EXISTS idx_tarefas_criada ON tarefas (criada_em);
`;

export class RepositorioPostgres implements Repositorio {
  constructor(private pool: Pool) {}

  /**
   * Cria as tabelas se ainda nao existirem.
   *
   * Migracao de verdade (com versionamento e rollback) entra quando houver
   * mudanca de esquema para migrar; hoje o esquema so nasce.
   */
  static async criar(urlOuPool: string | Pool): Promise<RepositorioPostgres> {
    const pool =
      typeof urlOuPool === 'string'
        ? new Pool({
            connectionString: urlOuPool,
            // Postgres gerenciado (Neon, Supabase) exige TLS e usa cadeia propria.
            ssl: urlOuPool.includes('localhost') ? false : { rejectUnauthorized: false },
            max: 5,
          })
        : urlOuPool;
    await pool.query(ESQUEMA);
    return new RepositorioPostgres(pool);
  }

  async fechar(): Promise<void> {
    await this.pool.end();
  }

  private async um<T>(sql: string, valores: unknown[] = []): Promise<T | null> {
    const r = await this.pool.query(sql, valores);
    return (r.rows[0] as T | undefined) ?? null;
  }

  async obterUsuario(id: string, fuso: string): Promise<Usuario> {
    const l = await this.um<{
      id: string;
      plano: string;
      xp: number;
      fuso: string;
      competencia: string;
      questoes_usadas: number;
      streak: number;
      maior_streak: number;
      congelamentos: number;
      ultimo_dia_concluido: string | null;
      concluidos: string[];
    }>('SELECT * FROM usuarios WHERE id = $1', [id]);

    if (!l) {
      const novo: Usuario = {
        id,
        plano: 'livre',
        cota: { competencia: competenciaAtual(), questoesUsadas: 0 },
        ofensiva: { streak: 0, maiorStreak: 0, congelamentos: 2, ultimoDiaConcluido: null, fuso },
        xp: 0,
        concluidos: [],
      };
      await this.salvarUsuario(novo);
      return novo;
    }

    const usuario: Usuario = {
      id: l.id,
      plano: l.plano as Plano,
      cota: { competencia: l.competencia, questoesUsadas: l.questoes_usadas },
      ofensiva: {
        streak: l.streak,
        maiorStreak: l.maior_streak,
        congelamentos: l.congelamentos,
        ultimoDiaConcluido: l.ultimo_dia_concluido,
        fuso: l.fuso,
      },
      xp: l.xp,
      concluidos: l.concluidos ?? [],
    };

    if (fuso && usuario.ofensiva.fuso !== fuso) usuario.ofensiva = { ...usuario.ofensiva, fuso };
    const competencia = competenciaAtual();
    if (usuario.cota.competencia !== competencia) {
      usuario.cota = { competencia, questoesUsadas: 0 };
    }
    return usuario;
  }

  async criarUsuario(usuario: Usuario): Promise<void> {
    await this.salvarUsuario(usuario);
  }

  async salvarUsuario(u: Usuario): Promise<void> {
    await this.pool.query(
      `INSERT INTO usuarios
         (id, plano, xp, fuso, competencia, questoes_usadas, streak, maior_streak,
          congelamentos, ultimo_dia_concluido, concluidos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         plano = EXCLUDED.plano, xp = EXCLUDED.xp, fuso = EXCLUDED.fuso,
         competencia = EXCLUDED.competencia, questoes_usadas = EXCLUDED.questoes_usadas,
         streak = EXCLUDED.streak, maior_streak = EXCLUDED.maior_streak,
         congelamentos = EXCLUDED.congelamentos,
         ultimo_dia_concluido = EXCLUDED.ultimo_dia_concluido,
         concluidos = EXCLUDED.concluidos`,
      [
        u.id,
        u.plano,
        u.xp,
        u.ofensiva.fuso,
        u.cota.competencia,
        u.cota.questoesUsadas,
        u.ofensiva.streak,
        u.ofensiva.maiorStreak,
        u.ofensiva.congelamentos,
        u.ofensiva.ultimoDiaConcluido,
        JSON.stringify(u.concluidos),
      ],
    );
  }

  async listarMaterias(usuarioId: string): Promise<Materia[]> {
    const r = await this.pool.query(
      'SELECT dados FROM materias WHERE usuario_id = $1 ORDER BY criada_em DESC',
      [usuarioId],
    );
    return r.rows.map((l: { dados: unknown }) => MateriaSchema.parse(l.dados));
  }

  async obterMateria(usuarioId: string, materiaId: string): Promise<Materia | null> {
    const l = await this.um<{ dados: unknown }>(
      'SELECT dados FROM materias WHERE id = $1 AND usuario_id = $2',
      [materiaId, usuarioId],
    );
    return l ? MateriaSchema.parse(l.dados) : null;
  }

  async salvarMateria(usuarioId: string, materia: Materia): Promise<void> {
    await this.pool.query(
      `INSERT INTO materias (id, usuario_id, criada_em, dados)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados`,
      [materia.id, usuarioId, materia.criadaEm, JSON.stringify(materia)],
    );
  }

  async obterBlocos(usuarioId: string, materiaId: string): Promise<string[] | null> {
    const l = await this.um<{ blocos: string[] }>(
      'SELECT blocos FROM materiais WHERE materia_id = $1 AND usuario_id = $2',
      [materiaId, usuarioId],
    );
    return l ? l.blocos : null;
  }

  async salvarBlocos(usuarioId: string, materiaId: string, blocos: string[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO materiais (materia_id, usuario_id, blocos)
       VALUES ($1,$2,$3)
       ON CONFLICT (materia_id) DO UPDATE SET blocos = EXCLUDED.blocos`,
      [materiaId, usuarioId, JSON.stringify(blocos)],
    );
  }

  // --- autenticacao ---

  private linhaParaCredencial(l: {
    usuario_id: string;
    email: string;
    senha_hash: string;
    criada_em: Date | string;
  }): Credencial {
    return {
      usuarioId: l.usuario_id,
      email: l.email,
      senhaHash: l.senha_hash,
      criadaEm: new Date(l.criada_em).toISOString(),
    };
  }

  async obterCredencialPorEmail(email: string): Promise<Credencial | null> {
    const l = await this.um<Parameters<typeof this.linhaParaCredencial>[0]>(
      'SELECT * FROM credenciais WHERE email = $1',
      [email],
    );
    return l ? this.linhaParaCredencial(l) : null;
  }

  async obterCredencialPorUsuario(usuarioId: string): Promise<Credencial | null> {
    const l = await this.um<Parameters<typeof this.linhaParaCredencial>[0]>(
      'SELECT * FROM credenciais WHERE usuario_id = $1',
      [usuarioId],
    );
    return l ? this.linhaParaCredencial(l) : null;
  }

  async salvarCredencial(c: Credencial): Promise<void> {
    await this.pool.query(
      `INSERT INTO credenciais (usuario_id, email, senha_hash, criada_em)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (usuario_id) DO UPDATE SET
         email = EXCLUDED.email, senha_hash = EXCLUDED.senha_hash`,
      [c.usuarioId, c.email, c.senhaHash, c.criadaEm],
    );
  }

  async criarSessao(s: Sessao): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessoes (token_hash, usuario_id, criada_em, expira_em, ultimo_uso)
       VALUES ($1,$2,$3,$4,$5)`,
      [s.tokenHash, s.usuarioId, s.criadaEm, s.expiraEm, s.ultimoUso],
    );
  }

  async obterSessao(tokenHash: string): Promise<Sessao | null> {
    const l = await this.um<{
      token_hash: string;
      usuario_id: string;
      criada_em: Date;
      expira_em: Date;
      ultimo_uso: Date;
    }>('SELECT * FROM sessoes WHERE token_hash = $1', [tokenHash]);
    return l
      ? {
          tokenHash: l.token_hash,
          usuarioId: l.usuario_id,
          criadaEm: new Date(l.criada_em).toISOString(),
          expiraEm: new Date(l.expira_em).toISOString(),
          ultimoUso: new Date(l.ultimo_uso).toISOString(),
        }
      : null;
  }

  async renovarSessao(tokenHash: string, expiraEm: string, ultimoUso: string): Promise<void> {
    await this.pool.query(
      'UPDATE sessoes SET expira_em = $1, ultimo_uso = $2 WHERE token_hash = $3',
      [expiraEm, ultimoUso, tokenHash],
    );
  }

  async apagarSessao(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM sessoes WHERE token_hash = $1', [tokenHash]);
  }

  async apagarSessoesDoUsuario(usuarioId: string): Promise<void> {
    await this.pool.query('DELETE FROM sessoes WHERE usuario_id = $1', [usuarioId]);
  }

  async limparSessoesVencidas(agora: Date): Promise<number> {
    const r = await this.pool.query('DELETE FROM sessoes WHERE expira_em <= $1', [
      agora.toISOString(),
    ]);
    return r.rowCount ?? 0;
  }

  /** Numa transacao: metade transferida seria pior do que nada transferido. */
  async transferirDados(deId: string, paraId: string): Promise<void> {
    await this.emTransacao(async (c) => {
      await c.query('UPDATE materias SET usuario_id = $1 WHERE usuario_id = $2', [paraId, deId]);
      await c.query('UPDATE materiais SET usuario_id = $1 WHERE usuario_id = $2', [paraId, deId]);
    });
  }

  private async emTransacao<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      const r = await fn(cliente);
      await cliente.query('COMMIT');
      return r;
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw erro;
    } finally {
      cliente.release();
    }
  }
}
