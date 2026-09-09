import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MateriaSchema, type Materia, type Plano } from '@estudaai/shared';
import { competenciaAtual, type Repositorio, type Usuario } from './repositorio.js';

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
 * questoes em tabelas so paga a pena quando houver consulta por questao — o que
 * chega junto com a revisao espacada, nao antes.
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
`;

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
}
