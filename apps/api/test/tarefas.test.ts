import { describe, expect, it } from 'vitest';
import { executarTarefa, FilaMemoria } from '../src/dominio/tarefas.js';

const semFalha = () => ({ mensagem: 'x', codigo: 'y', adiantaTentarDeNovo: false });

describe('FilaMemoria', () => {
  it('nunca deixa o progresso andar para tras', async () => {
    const fila = new FilaMemoria();
    const t = await fila.criar('ana', 'inicio');
    await fila.andar(t.id, 'meio', 0.6);
    await fila.andar(t.id, 'outra coisa', 0.2);
    expect((await fila.obter(t.id, 'ana'))!.progresso).toBe(0.6);
  });

  it('so entrega a tarefa para quem a criou', async () => {
    const fila = new FilaMemoria();
    const t = await fila.criar('ana', 'inicio');
    expect(await fila.obter(t.id, 'ana')).not.toBeNull();
    expect(await fila.obter(t.id, 'bia')).toBeNull();
  });

  it('limpa tarefas velhas e preserva as recentes', async () => {
    const fila = new FilaMemoria();
    const velha = await fila.criar('ana', 'inicio');
    await fila.concluir(velha.id, { materiaId: 'm', temaId: null, custoUSD: 0 });
    const recente = await fila.criar('ana', 'inicio');

    // Uma hora de idade limpa a velha, mas a recente acabou de nascer.
    const daquiUmaHoraEMeia = Date.now() + 90 * 60 * 1000;
    expect(await fila.limpar(60 * 60 * 1000, daquiUmaHoraEMeia)).toBe(2);
    expect(await fila.obter(recente.id, 'ana')).toBeNull();

    const outra = new FilaMemoria();
    const nova = await outra.criar('ana', 'inicio');
    expect(await outra.limpar(60 * 60 * 1000, Date.now())).toBe(0);
    expect(await outra.obter(nova.id, 'ana')).not.toBeNull();
  });
});

describe('executarTarefa', () => {
  it('registra o resultado quando o trabalho termina', async () => {
    const fila = new FilaMemoria();
    const t = await fila.criar('ana', 'inicio');
    let segurada: Promise<unknown> | null = null;

    executarTarefa(
      fila,
      t.id,
      async () => ({ materiaId: 'm1', temaId: 't1', custoUSD: 0.1 }),
      semFalha,
      (p) => {
        segurada = p;
      },
    );

    // `segurar` recebe a promessa: e ela que o serverless usa para nao congelar
    // a instancia antes de a geracao terminar.
    expect(segurada).not.toBeNull();
    await segurada;

    const pronta = (await fila.obter(t.id, 'ana'))!;
    expect(pronta.estado).toBe('concluida');
    expect(pronta.progresso).toBe(1);
    expect(pronta.resultado).toMatchObject({ materiaId: 'm1' });
  });

  it('captura a falha em vez de derrubar o processo', async () => {
    const fila = new FilaMemoria();
    const t = await fila.criar('ana', 'inicio');
    let segurada: Promise<unknown> = Promise.resolve();

    executarTarefa(
      fila,
      t.id,
      async () => {
        throw new Error('estourou');
      },
      (erro) => ({
        mensagem: (erro as Error).message,
        codigo: 'desconhecido',
        adiantaTentarDeNovo: true,
      }),
      (p) => {
        segurada = p;
      },
    );
    await segurada;

    const falha = (await fila.obter(t.id, 'ana'))!;
    expect(falha.estado).toBe('falhou');
    expect(falha.falha!.mensagem).toBe('estourou');
  });

  it('funciona sem `segurar` — o servidor comum nao precisa dele', async () => {
    const fila = new FilaMemoria();
    const t = await fila.criar('ana', 'inicio');
    executarTarefa(fila, t.id, async () => ({ materiaId: 'm', temaId: null, custoUSD: 0 }), semFalha);
    await new Promise((r) => setTimeout(r, 10));
    expect((await fila.obter(t.id, 'ana'))!.estado).toBe('concluida');
  });
});
