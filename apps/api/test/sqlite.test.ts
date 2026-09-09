import { describe, expect, it } from 'vitest';
import { MateriaSchema } from '@estudaai/shared';
import { RepositorioSqlite } from '../src/infra/repositorioSqlite.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function materiaDeTeste(id: string, nome = 'Biologia') {
  return MateriaSchema.parse({
    id,
    nome,
    cor: '#E8501A',
    criadaEm: new Date().toISOString(),
    temas: [
      { id: `${id}-t1`, nome: 'Membrana', conceito: 'A porteira', chave: ['membrana'] },
      { id: `${id}-t2`, nome: 'Nucleo', conceito: 'O cofre', chave: ['dna'] },
    ],
  });
}

describe('RepositorioSqlite', () => {
  it('cria usuario novo com os padroes certos', async () => {
    const repo = new RepositorioSqlite(':memory:');
    const u = await repo.obterUsuario('ana', 'America/Sao_Paulo');
    expect(u).toMatchObject({
      plano: 'livre',
      xp: 0,
      concluidos: [],
      ofensiva: { streak: 0, congelamentos: 2, ultimoDiaConcluido: null },
    });
  });

  it('guarda e devolve o estado da ofensiva', async () => {
    const repo = new RepositorioSqlite(':memory:');
    const u = await repo.obterUsuario('ana', 'America/Sao_Paulo');
    u.ofensiva = { ...u.ofensiva, streak: 7, maiorStreak: 9, ultimoDiaConcluido: '2026-09-08' };
    u.xp = 250;
    u.concluidos = ['t1', 't2'];
    await repo.salvarUsuario(u);

    const lido = await repo.obterUsuario('ana', 'America/Sao_Paulo');
    expect(lido.ofensiva.streak).toBe(7);
    expect(lido.ofensiva.ultimoDiaConcluido).toBe('2026-09-08');
    expect(lido.xp).toBe(250);
    expect(lido.concluidos).toEqual(['t1', 't2']);
  });

  it('atualiza o fuso mas preserva a data ja gravada', async () => {
    const repo = new RepositorioSqlite(':memory:');
    const u = await repo.obterUsuario('ana', 'America/Sao_Paulo');
    u.ofensiva = { ...u.ofensiva, ultimoDiaConcluido: '2026-09-08', streak: 3 };
    await repo.salvarUsuario(u);

    const emTokyo = await repo.obterUsuario('ana', 'Asia/Tokyo');
    expect(emTokyo.ofensiva.fuso).toBe('Asia/Tokyo');
    expect(emTokyo.ofensiva.ultimoDiaConcluido).toBe('2026-09-08');
  });

  it('zera a cota quando vira o mes', async () => {
    const repo = new RepositorioSqlite(':memory:');
    const u = await repo.obterUsuario('ana', 'UTC');
    u.cota = { competencia: '2020-01', questoesUsadas: 80 };
    await repo.salvarUsuario(u);

    const lido = await repo.obterUsuario('ana', 'UTC');
    expect(lido.cota.questoesUsadas).toBe(0);
    expect(lido.cota.competencia).not.toBe('2020-01');
  });

  it('nao mistura as materias de usuarios diferentes', async () => {
    const repo = new RepositorioSqlite(':memory:');
    await repo.salvarMateria('ana', materiaDeTeste('m1', 'Biologia'));
    await repo.salvarMateria('bia', materiaDeTeste('m2', 'Quimica'));

    expect((await repo.listarMaterias('ana')).map((m) => m.nome)).toEqual(['Biologia']);
    expect(await repo.obterMateria('bia', 'm1')).toBeNull();
    expect(await repo.obterMateria('ana', 'm1')).not.toBeNull();
  });

  it('atualiza a materia em vez de duplicar', async () => {
    const repo = new RepositorioSqlite(':memory:');
    const m = materiaDeTeste('m1');
    await repo.salvarMateria('ana', m);
    await repo.salvarMateria('ana', { ...m, nome: 'Biologia Celular' });

    const lista = await repo.listarMaterias('ana');
    expect(lista).toHaveLength(1);
    expect(lista[0]!.nome).toBe('Biologia Celular');
  });

  it('guarda os blocos do material fora da materia', async () => {
    const repo = new RepositorioSqlite(':memory:');
    await repo.salvarBlocos('ana', 'm1', ['bloco um', 'bloco dois']);
    expect(await repo.obterBlocos('ana', 'm1')).toEqual(['bloco um', 'bloco dois']);
    expect(await repo.obterBlocos('bia', 'm1')).toBeNull();
  });

  it('sobrevive ao reinicio do processo — o motivo de existir', async () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'estudaai-'));
    const arquivo = path.join(pasta, 'teste.db');
    try {
      const antes = new RepositorioSqlite(arquivo);
      await repoSemear(antes);
      antes.fechar();

      // Outro processo abriria assim: nada em memoria, so o arquivo.
      const depois = new RepositorioSqlite(arquivo);
      const u = await depois.obterUsuario('ana', 'UTC');
      expect(u.ofensiva.streak).toBe(5);
      expect((await depois.listarMaterias('ana'))[0]!.nome).toBe('Biologia');
      expect(await depois.obterBlocos('ana', 'm1')).toEqual(['conteudo']);
      depois.fechar();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});

async function repoSemear(repo: RepositorioSqlite) {
  const u = await repo.obterUsuario('ana', 'UTC');
  u.ofensiva = { ...u.ofensiva, streak: 5, maiorStreak: 5, ultimoDiaConcluido: '2026-09-09' };
  await repo.salvarUsuario(u);
  await repo.salvarMateria('ana', materiaDeTeste('m1'));
  await repo.salvarBlocos('ana', 'm1', ['conteudo']);
}
