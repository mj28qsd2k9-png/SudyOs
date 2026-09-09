import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  EmailSchema,
  hashDoToken,
  novoToken,
  novoUsuarioId,
  tokenDoCabecalho,
  VALIDADE_SESSAO_MS,
} from '../dominio/autenticacao.js';
import { conferirSenha, guardarSenha, MAXIMO_SENHA, MINIMO_SENHA } from '../dominio/senha.js';
import { competenciaAtual, type Repositorio, type Usuario } from '../infra/repositorio.js';
import { exigirSessao, fusoDaRequisicao, identificar } from './contexto.js';

const CorpoCadastro = z.object({
  email: EmailSchema,
  senha: z.string().min(MINIMO_SENHA).max(MAXIMO_SENHA),
  /**
   * Id do aparelho usado antes de criar a conta. Quando vem, as materias
   * geradas sem login passam para a conta nova. Sem isso, a primeira coisa que
   * o aluno faz depois de se cadastrar e perder o que ja tinha gerado.
   */
  aparelho: z.string().trim().min(1).max(80).optional(),
});

const CorpoEntrada = z.object({
  email: EmailSchema,
  senha: z.string().min(1).max(MAXIMO_SENHA),
});

/**
 * Freio de forca bruta, em memoria.
 *
 * Segura o caso obvio — alguem varrendo senhas de um e-mail — sem precisar de
 * Redis. Em varias instancias cada uma conta o seu, entao isto e piso, nao
 * teto: um limitador compartilhado entra junto com o deploy multi-instancia.
 */
const MAX_TENTATIVAS = 8;
const JANELA_MS = 15 * 60 * 1000;

class Freio {
  private tentativas = new Map<string, { contagem: number; ate: number }>();

  bloqueado(chave: string, agora = Date.now()): boolean {
    const t = this.tentativas.get(chave);
    if (!t) return false;
    if (agora > t.ate) {
      this.tentativas.delete(chave);
      return false;
    }
    return t.contagem >= MAX_TENTATIVAS;
  }

  errou(chave: string, agora = Date.now()): void {
    const t = this.tentativas.get(chave);
    if (!t || agora > t.ate) {
      this.tentativas.set(chave, { contagem: 1, ate: agora + JANELA_MS });
      return;
    }
    t.contagem += 1;
  }

  acertou(chave: string): void {
    this.tentativas.delete(chave);
  }
}

function usuarioNovo(id: string, fuso: string): Usuario {
  return {
    id,
    plano: 'livre',
    cota: { competencia: competenciaAtual(), questoesUsadas: 0 },
    ofensiva: { streak: 0, maiorStreak: 0, congelamentos: 2, ultimoDiaConcluido: null, fuso },
    xp: 0,
    concluidos: [],
  };
}

function chaveDoFreio(req: FastifyRequest, email: string): string {
  return `${req.ip}|${email}`;
}

export async function rotasAuth(app: FastifyInstance, deps: { repo: Repositorio }) {
  const { repo } = deps;
  const freio = new Freio();

  async function abrirSessao(usuarioId: string) {
    const { token, hash } = novoToken();
    const agora = new Date();
    await repo.criarSessao({
      tokenHash: hash,
      usuarioId,
      criadaEm: agora.toISOString(),
      expiraEm: new Date(agora.getTime() + VALIDADE_SESSAO_MS).toISOString(),
      ultimoUso: agora.toISOString(),
    });
    return { token, expiraEm: new Date(agora.getTime() + VALIDADE_SESSAO_MS).toISOString() };
  }

  app.post('/auth/cadastrar', async (req, reply) => {
    const corpo = CorpoCadastro.safeParse(req.body);
    if (!corpo.success) {
      return reply.code(400).send({
        erro: `Confira o e-mail e use uma senha de pelo menos ${MINIMO_SENHA} caracteres.`,
        codigo: 'dados_invalidos',
      });
    }

    const { email, senha, aparelho } = corpo.data;
    if (await repo.obterCredencialPorEmail(email)) {
      return reply.code(409).send({ erro: 'Já existe uma conta com esse e-mail.', codigo: 'email_em_uso' });
    }

    const fuso = fusoDaRequisicao(req);
    const usuarioId = novoUsuarioId();
    await repo.criarUsuario(usuarioNovo(usuarioId, fuso));

    try {
      await repo.salvarCredencial({
        usuarioId,
        email,
        senhaHash: await guardarSenha(senha),
        criadaEm: new Date().toISOString(),
      });
    } catch {
      // O indice UNICO no e-mail pega a corrida entre dois cadastros iguais.
      return reply.code(409).send({ erro: 'Já existe uma conta com esse e-mail.', codigo: 'email_em_uso' });
    }

    // Traz o que o aluno gerou antes de ter conta.
    let materiasTrazidas = 0;
    if (aparelho && aparelho !== usuarioId) {
      const jaTemDono = await repo.obterCredencialPorUsuario(aparelho);
      if (!jaTemDono) {
        materiasTrazidas = (await repo.listarMaterias(aparelho)).length;
        await repo.transferirDados(aparelho, usuarioId);
      }
    }

    const sessao = await abrirSessao(usuarioId);
    return reply.code(201).send({ ...sessao, email, materiasTrazidas });
  });

  app.post('/auth/entrar', async (req, reply) => {
    const corpo = CorpoEntrada.safeParse(req.body);
    if (!corpo.success) {
      return reply.code(400).send({ erro: 'E-mail ou senha inválidos.', codigo: 'dados_invalidos' });
    }

    const { email, senha } = corpo.data;
    const chave = chaveDoFreio(req, email);
    if (freio.bloqueado(chave)) {
      return reply.code(429).send({
        erro: 'Muitas tentativas. Tente de novo daqui a alguns minutos.',
        codigo: 'muitas_tentativas',
      });
    }

    const credencial = await repo.obterCredencialPorEmail(email);
    // Mesma resposta para e-mail inexistente e senha errada: dizer qual dos
    // dois falhou entrega a lista de quem tem conta.
    const negar = () => {
      freio.errou(chave);
      return reply.code(401).send({ erro: 'E-mail ou senha inválidos.', codigo: 'credenciais_invalidas' });
    };

    if (!credencial) {
      // Gasta o mesmo tempo do caminho com senha para nao dar para distinguir
      // pelo relogio quem tem conta e quem nao tem.
      await guardarSenha(senha);
      return negar();
    }
    if (!(await conferirSenha(senha, credencial.senhaHash))) return negar();

    freio.acertou(chave);
    const sessao = await abrirSessao(credencial.usuarioId);
    return reply.send({ ...sessao, email: credencial.email });
  });

  app.post('/auth/sair', async (req, reply) => {
    const token = tokenDoCabecalho(req.headers.authorization);
    if (token) await repo.apagarSessao(hashDoToken(token));
    // Sempre 204: sair nunca falha, nem com token ja invalido.
    return reply.code(204).send();
  });

  app.post(
    '/auth/sair-de-todos',
    { preHandler: exigirSessao(repo) },
    async (req, reply) => {
      await repo.apagarSessoesDoUsuario(identificar(req).usuarioId);
      return reply.code(204).send();
    },
  );

  app.get('/auth/eu', { preHandler: exigirSessao(repo) }, async (req, reply) => {
    const { usuarioId } = identificar(req);
    const credencial = await repo.obterCredencialPorUsuario(usuarioId);
    if (!credencial) return reply.code(404).send({ erro: 'Conta não encontrada.' });
    return { usuarioId, email: credencial.email, criadaEm: credencial.criadaEm };
  });
}
