import { describe, expect, it } from 'vitest';
import { FilaTarefas } from '../src/dominio/tarefas.js';

const semFalha = () => ({ mensagem: 'x', codigo: 'y', adiantaTentarDeNovo: false });

describe('FilaTarefas', () => {
  it('nunca deixa o progresso andar para tras', () => {
    const fila = new FilaTarefas();
    const t = fila.criar('ana', 'inicio');
    fila.andar(t.id, 'meio', 0.6);
    fila.andar(t.id, 'outra coisa', 0.2);
    expect(fila.obter(t.id, 'ana')!.progresso).toBe(0.6);
  });

  it('so entrega a tarefa para quem a criou', () => {
    const fila = new FilaTarefas();
    const t = fila.criar('ana', 'inicio');
    expect(fila.obter(t.id, 'ana')).not.toBeNull();
    expect(fila.obter(t.id, 'bia')).toBeNull();
  });

  it('registra o resultado quando o trabalho termina', async () => {
    const fila = new FilaTarefas();
    const t = fila.criar('ana', 'inicio');
    fila.executar(
      t.id,
      async () => ({ materiaId: 'm1', temaId: 't1', custoUSD: 0.1 }),
      semFalha,
    );
    await new Promise((r) => setTimeout(r, 5));
    const pronta = fila.obter(t.id, 'ana')!;
    expect(pronta.estado).toBe('concluida');
    expect(pronta.progresso).toBe(1);
    expect(pronta.resultado).toMatchObject({ materiaId: 'm1' });
  });

  it('captura a falha em vez de derrubar o processo', async () => {
    const fila = new FilaTarefas();
    const t = fila.criar('ana', 'inicio');
    fila.executar(
      t.id,
      async () => {
        throw new Error('estourou');
      },
      (erro) => ({
        mensagem: (erro as Error).message,
        codigo: 'desconhecido',
        adiantaTentarDeNovo: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 5));
    const falha = fila.obter(t.id, 'ana')!;
    expect(falha.estado).toBe('falhou');
    expect(falha.falha!.mensagem).toBe('estourou');
  });

  it('limpa tarefas velhas e preserva as recentes', () => {
    const fila = new FilaTarefas();
    const velha = fila.criar('ana', 'inicio');
    fila.concluir(velha.id, { materiaId: 'm', temaId: null, custoUSD: 0 });
    const nova = fila.criar('ana', 'inicio');

    const duasHorasDepois = Date.now() + 2 * 60 * 60 * 1000;
    expect(fila.limpar(60 * 60 * 1000, duasHorasDepois)).toBe(2);

    const fila2 = new FilaTarefas();
    const recente = fila2.criar('ana', 'inicio');
    expect(fila2.limpar(60 * 60 * 1000, Date.now())).toBe(0);
    expect(fila2.obter(recente.id, 'ana')).not.toBeNull();
    expect(nova.id).not.toBe(velha.id);
  });
});
