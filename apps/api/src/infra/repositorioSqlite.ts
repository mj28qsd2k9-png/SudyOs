import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MateriaSchema, type Materia, type Plano, type Revisao } from '@estudaai/shared';
import type { Sessao } from '../dominio/autenticacao.js';
import { competenciaAtual, type Credencial, type Repositorio, type Usuario } from './repositorio.js';

/**
 * Persistencia em SQLite, pelo modulo nativo do Node (sem dependencia).
 *
 * O repositorio em memoria servia para exercitar a geracao antes do banco, mas
 * nao sobrevive a um restart — e um app que perde as materias do aluno quando o
 * servidor reinicia nao e um app. Isto resolve isso hoje, atras da mesma
 * interface: trocar por Postgres na hora do deploy e escrever outra classe.
 *
 * A materia e guardada como JSON numa coluna. E deliberado: o formato dela e o
 * contrato Zod compartilhado, que ja valida na leitura, e normalizar temas e
 * questoes em tabelas so paga a pena quando houver consulta por questao. A
 * revisao espacada chegou e nao pediu isso: ela guarda a CARTA (o historico do
 * aluno naquela questao) numa tabela propria e busca a questao pelo id dentro
 * do JSON da materia. O que ela consulta e o vencimento, nao o enunciado.
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
  concluidos TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS materias (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  criada_em TEXT NOT NULL,
  dados TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materias_usuario ON materias (usuario_id, criada_em DESC);

CREATE TABLE IF NOT EXISTS materiais (
  materia_id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  blocos TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credenciais (
  usuario_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  criada_em TEXT NOT NULL
);
-- Indice UNICO, nao so unicidade na aplicacao: duas requisicoes de cadastro
-- simultaneas com o mesmo e-mail passariam por qualquer checagem em codigo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credenciais_email ON credenciais (email);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  criada_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  ultimo_uso TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes (expira_em);

-- Baralho de revisao: uma carta por questao que o aluno ja errou.
-- Fica fora da materia porque e dado do ALUNO sobre a questao, nao da questao.
-- Guardado assim, regerar um tema nao apaga o historico de erro junto.
CREATE TABLE IF NOT EXISTS revisoes (
  usuario_id TEXT NOT NULL,
  questao_id TEXT NOT NULL,
  materia_id TEXT NOT NULL,
  tema_id TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  acertos_seguidos INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  intervalo_dias INTEGER NOT NULL DEFAULT 0,
  proxima_em TEXT NOT NULL,
  ultima_em TEXT NOT NULL,
  PRIMARY KEY (usuario_id, questao_id)
);
-- A consulta que importa e "o que vence hoje, deste aluno".
CREATE INDEX IF NOT EXISTS idx_revisoes_vencimento ON revisoes (usuario_id, proxima_em);
`;

type LinhaRevisao = {
  usuario_id: string;
  questao_id: string;
  materia_id: string;
  tema_id: string;
  tags: string;
  acertos_seguidos: number;
  erros: number;
  intervalo_dias: number;
  proxima_em: string;
  ultima_em: string;
};

type LinhaUsuario = {
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
  concluidos: string;
};

export class RepositorioSqlite implements Repositorio {
  private db: DatabaseSync;

  constructor(arquivo: string) {
    if (arquivo !== ':memory:') mkdirSync(path.dirname(arquivo), { recursive: true });
    this.db = new DatabaseSync(arquivo);
    // WAL deixa leitura e escrita conviverem sem travar uma na outra.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(ESQUEMA);
  }

  fechar(): void {
    this.db.close();
  }

  async obterUsuario(id: string, fuso: string): Promise<Usuario> {
    const linha = this.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as
      | LinhaUsuario
      | undefined;

    if (!linha) {
      const novo: Usuario = {
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
      await this.salvarUsuario(novo);
      return novo;
    }

    const usuario: Usuario = {
      id: linha.id,
      plano: linha.plano as Plano,
      cota: { competencia: linha.competencia, questoesUsadas: linha.questoes_usadas },
      ofensiva: {
        streak: linha.streak,
        maiorStreak: linha.maior_streak,
        congelamentos: linha.congelamentos,
        ultimoDiaConcluido: linha.ultimo_dia_concluido,
        fuso: linha.fuso,
      },
      xp: linha.xp,
      concluidos: JSON.parse(linha.concluidos) as string[],
    };

    // Quem viajou mudou de fuso; a data ja gravada continua valendo.
    if (fuso && usuario.ofensiva.fuso !== fuso) usuario.ofensiva = { ...usuario.ofensiva, fuso };

    // Virou o mes: a cota reinicia.
    const competencia = competenciaAtual();
    if (usuario.cota.competencia !== competencia) {
      usuario.cota = { competencia, questoesUsadas: 0 };
    }
    return usuario;
  }

  async salvarUsuario(u: Usuario): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO usuarios
           (id, plano, xp, fuso, competencia, questoes_usadas, streak, maior_streak,
            congelamentos, ultimo_dia_concluido, concluidos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           plano = excluded.plano,
           xp = excluded.xp,
           fuso = excluded.fuso,
           competencia = excluded.competencia,
           questoes_usadas = excluded.questoes_usadas,
           streak = excluded.streak,
           maior_streak = excluded.maior_streak,
           congelamentos = excluded.congelamentos,
           ultimo_dia_concluido = excluded.ultimo_dia_concluido,
           concluidos = excluded.concluidos`,
      )
      .run(
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
      );
  }

  async listarMaterias(usuarioId: string): Promise<Materia[]> {
    const linhas = this.db
      .prepare('SELECT dados FROM materias WHERE usuario_id = ? ORDER BY criada_em DESC')
      .all(usuarioId) as { dados: string }[];
    return linhas.map((l) => MateriaSchema.parse(JSON.parse(l.dados)));
  }

  async obterMateria(usuarioId: string, materiaId: string): Promise<Materia | null> {
    const linha = this.db
      .prepare('SELECT dados FROM materias WHERE id = ? AND usuario_id = ?')
      .get(materiaId, usuarioId) as { dados: string } | undefined;
    return linha ? MateriaSchema.parse(JSON.parse(linha.dados)) : null;
  }

  async salvarMateria(usuarioId: string, materia: Materia): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO materias (id, usuario_id, criada_em, dados)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET dados = excluded.dados`,
      )
      .run(materia.id, usuarioId, materia.criadaEm, JSON.stringify(materia));
  }

  async obterBlocos(usuarioId: string, materiaId: string): Promise<string[] | null> {
    const linha = this.db
      .prepare('SELECT blocos FROM materiais WHERE materia_id = ? AND usuario_id = ?')
      .get(materiaId, usuarioId) as { blocos: string } | undefined;
    return linha ? (JSON.parse(linha.blocos) as string[]) : null;
  }

  async salvarBlocos(usuarioId: string, materiaId: string, blocos: string[]): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO materiais (materia_id, usuario_id, blocos)
         VALUES (?, ?, ?)
         ON CONFLICT(materia_id) DO UPDATE SET blocos = excluded.blocos`,
      )
      .run(materiaId, usuarioId, JSON.stringify(blocos));
  }

  async listarRevisoes(usuarioId: string): Promise<Revisao[]> {
    const linhas = this.db
      .prepare('SELECT * FROM revisoes WHERE usuario_id = ?')
      .all(usuarioId) as LinhaRevisao[];
    return linhas.map((l) => ({
      questaoId: l.questao_id,
      materiaId: l.materia_id,
      temaId: l.tema_id,
      tags: JSON.parse(l.tags) as string[],
      acertosSeguidos: l.acertos_seguidos,
      erros: l.erros,
      intervaloDias: l.intervalo_dias,
      proximaEm: l.proxima_em,
      ultimaEm: l.ultima_em,
    }));
  }

  async salvarRevisoes(usuarioId: string, revisoes: Revisao[]): Promise<void> {
    if (revisoes.length === 0) return;
    const gravar = this.db.prepare(
      `INSERT INTO revisoes
         (usuario_id, questao_id, materia_id, tema_id, tags,
          acertos_seguidos, erros, intervalo_dias, proxima_em, ultima_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(usuario_id, questao_id) DO UPDATE SET
         tags = excluded.tags,
         acertos_seguidos = excluded.acertos_seguidos,
         erros = excluded.erros,
         intervalo_dias = excluded.intervalo_dias,
         proxima_em = excluded.proxima_em,
         ultima_em = excluded.ultima_em`,
    );
    // Uma transacao so: a sessao inteira de revisao entra ou nao entra.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const r of revisoes) {
        gravar.run(
          usuarioId,
          r.questaoId,
          r.materiaId,
          r.temaId,
          JSON.stringify(r.tags),
          r.acertosSeguidos,
          r.erros,
          r.intervaloDias,
          r.proximaEm,
          r.ultimaEm,
        );
      }
      this.db.exec('COMMIT');
    } catch (erro) {
      this.db.exec('ROLLBACK');
      throw erro;
    }
  }

  async criarUsuario(usuario: Usuario): Promise<void> {
    await this.salvarUsuario(usuario);
  }

  // --- autenticacao ---

  async obterCredencialPorEmail(email: string): Promise<Credencial | null> {
    const l = this.db.prepare('SELECT * FROM credenciais WHERE email = ?').get(email) as
      | { usuario_id: string; email: string; senha_hash: string; criada_em: string }
      | undefined;
    return l
      ? { usuarioId: l.usuario_id, email: l.email, senhaHash: l.senha_hash, criadaEm: l.criada_em }
      : null;
  }

  async obterCredencialPorUsuario(usuarioId: string): Promise<Credencial | null> {
    const l = this.db.prepare('SELECT * FROM credenciais WHERE usuario_id = ?').get(usuarioId) as
      | { usuario_id: string; email: string; senha_hash: string; criada_em: string }
      | undefined;
    return l
      ? { usuarioId: l.usuario_id, email: l.email, senhaHash: l.senha_hash, criadaEm: l.criada_em }
      : null;
  }

  async salvarCredencial(c: Credencial): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO credenciais (usuario_id, email, senha_hash, criada_em)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(usuario_id) DO UPDATE SET
           email = excluded.email,
           senha_hash = excluded.senha_hash`,
      )
      .run(c.usuarioId, c.email, c.senhaHash, c.criadaEm);
  }

  async criarSessao(s: Sessao): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessoes (token_hash, usuario_id, criada_em, expira_em, ultimo_uso)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(s.tokenHash, s.usuarioId, s.criadaEm, s.expiraEm, s.ultimoUso);
  }

  async obterSessao(tokenHash: string): Promise<Sessao | null> {
    const l = this.db.prepare('SELECT * FROM sessoes WHERE token_hash = ?').get(tokenHash) as
      | {
          token_hash: string;
          usuario_id: string;
          criada_em: string;
          expira_em: string;
          ultimo_uso: string;
        }
      | undefined;
    return l
      ? {
          tokenHash: l.token_hash,
          usuarioId: l.usuario_id,
          criadaEm: l.criada_em,
          expiraEm: l.expira_em,
          ultimoUso: l.ultimo_uso,
        }
      : null;
  }

  async renovarSessao(tokenHash: string, expiraEm: string, ultimoUso: string): Promise<void> {
    this.db
      .prepare('UPDATE sessoes SET expira_em = ?, ultimo_uso = ? WHERE token_hash = ?')
      .run(expiraEm, ultimoUso, tokenHash);
  }

  async apagarSessao(tokenHash: string): Promise<void> {
    this.db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(tokenHash);
  }

  async apagarSessoesDoUsuario(usuarioId: string): Promise<void> {
    this.db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
  }

  async limparSessoesVencidas(agora: Date): Promise<number> {
    const r = this.db
      .prepare('DELETE FROM sessoes WHERE expira_em <= ?')
      .run(agora.toISOString());
    return Number(r.changes);
  }

  /**
   * Tudo numa transacao: se o meio falhar, o aluno nao pode ficar com metade
   * das materias numa conta e metade na outra.
   */
  async transferirDados(deId: string, paraId: string): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE materias SET usuario_id = ? WHERE usuario_id = ?').run(paraId, deId);
      this.db.prepare('UPDATE materiais SET usuario_id = ? WHERE usuario_id = ?').run(paraId, deId);
      // O baralho vai junto: quem estudou sem conta e depois se cadastrou nao
      // pode perder os proprios erros no caminho.
      this.db.prepare('UPDATE revisoes SET usuario_id = ? WHERE usuario_id = ?').run(paraId, deId);
      this.db.exec('COMMIT');
    } catch (erro) {
      this.db.exec('ROLLBACK');
      throw erro;
    }
  }
}
