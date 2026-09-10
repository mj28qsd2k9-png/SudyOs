import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Materia } from '@estudaai/shared';

/**
 * Cliente da API.
 *
 * A identidade vai no `Authorization: Bearer`. O token e opaco: o app nao le
 * nada de dentro dele, so o carrega — quem sabe de quem e a sessao e o servidor.
 */

/**
 * Onde fica a API.
 *
 * Tres situacoes, nesta ordem:
 *
 * 1. `EXPO_PUBLIC_API_URL` — usado pelo `npm run web`, que roda o app numa porta
 *    diferente da API e por isso precisa do endereco completo.
 * 2. `extra.apiUrl` no app.json — para o celular, que precisa do IP da maquina
 *    na rede local.
 * 3. Mesma origem — o caso do `npm start`, em que o proprio backend serve o app.
 *    Caminho relativo funciona em qualquer endereco: localhost, IP da rede ou
 *    um dominio, sem reconfigurar nada.
 */
const CONFIGURADO =
  process.env['EXPO_PUBLIC_API_URL'] ||
  (Constants.expoConfig?.extra?.['apiUrl'] as string | undefined) ||
  '';

const ORIGEM: string =
  CONFIGURADO ||
  (Platform.OS === 'web'
    ? '' // mesma origem
    : 'http://localhost:3333'); // no aparelho isso aponta para o proprio
                                // aparelho — configure extra.apiUrl.

/**
 * `/api` na frente de tudo.
 *
 * O backend serve o app no mesmo endereco, entao API e telas dividiam o espaco
 * de enderecos: `/perfil` era rota das duas, e recarregar a aba Perfil
 * devolvia JSON. O prefixo separa os dois para sempre.
 */
const BASE = `${ORIGEM}/api`;

export class ErroApi extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codigo?: string,
    readonly adiantaTentarDeNovo = true,
  ) {
    super(message);
    this.name = 'ErroApi';
  }
}

export type Sessao = { token: string; fuso: string };

function cabecalhos(sessao: Sessao, extras: Record<string, string> = {}) {
  return { authorization: `Bearer ${sessao.token}`, 'x-fuso': sessao.fuso, ...extras };
}

/** `true` quando o servidor disse que a sessao acabou e o app precisa relogar. */
export function ehSessaoMorta(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 401;
}

export type Credenciais = { email: string; senha: string };

export type RespostaSessao = {
  token: string;
  expiraEm: string;
  email: string;
  materiasTrazidas?: number;
};

async function ler<T>(resposta: Response): Promise<T> {
  const corpo = await resposta.json().catch(() => ({}) as Record<string, unknown>);
  if (!resposta.ok) {
    throw new ErroApi(
      (corpo['erro'] as string) ?? `Erro ${resposta.status}`,
      resposta.status,
      corpo['codigo'] as string | undefined,
      (corpo['adiantaTentarDeNovo'] as boolean | undefined) ?? true,
    );
  }
  return corpo as T;
}

export type Cota = {
  competencia: string;
  questoesUsadas: number;
  ilimitada?: boolean;
  temasRestantes?: number | null;
};

export type Perfil = {
  plano: string;
  xp: number;
  cota: Cota;
  ofensiva: {
    streak: number;
    maiorStreak: number;
    congelamentos: number;
    diaFeito: boolean;
    proximoMarco: number | null;
    fuso: string;
  };
  temasConcluidos: number;
};

export type Tarefa = {
  id: string;
  estado: 'na_fila' | 'rodando' | 'concluida' | 'falhou';
  etapa: string;
  progresso: number;
  resultado?: { materiaId: string; temaId: string | null; custoUSD: number; aviso?: string };
  falha?: { mensagem: string; codigo: string; adiantaTentarDeNovo: boolean };
};

export type ResultadoConclusao = {
  acertos: number;
  total: number;
  erros: { questaoId: string; tags: string[] }[];
  xpGanho: number;
  xp: number;
  ofensiva: {
    streak: number;
    maiorStreak: number;
    subiu: boolean;
    quebrou: boolean;
    congelamentosGastos: number;
    congelamentos: number;
    proximoMarco: number | null;
  };
};

export const api = {
  base: BASE || 'mesma origem',

  async saude(): Promise<{ ok: boolean; modelo: string; chaveConfigurada: boolean }> {
    return ler(await fetch(`${BASE}/saude`));
  },

  async cadastrar(
    credenciais: Credenciais,
    fuso: string,
    aparelho?: string,
  ): Promise<RespostaSessao> {
    return ler(
      await fetch(`${BASE}/auth/cadastrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fuso': fuso },
        body: JSON.stringify({ ...credenciais, ...(aparelho ? { aparelho } : {}) }),
      }),
    );
  },

  async entrar(credenciais: Credenciais, fuso: string): Promise<RespostaSessao> {
    return ler(
      await fetch(`${BASE}/auth/entrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-fuso': fuso },
        body: JSON.stringify(credenciais),
      }),
    );
  },

  async sair(sessao: Sessao): Promise<void> {
    // Falhar aqui nao pode impedir o logout local: o token some do aparelho de
    // qualquer jeito, e o servidor o expira sozinho depois.
    await fetch(`${BASE}/auth/sair`, { method: 'POST', headers: cabecalhos(sessao) }).catch(
      () => undefined,
    );
  },

  async eu(sessao: Sessao): Promise<{ usuarioId: string; email: string; criadaEm: string }> {
    return ler(await fetch(`${BASE}/auth/eu`, { headers: cabecalhos(sessao) }));
  },

  async perfil(sessao: Sessao): Promise<Perfil> {
    return ler(await fetch(`${BASE}/perfil`, { headers: cabecalhos(sessao) }));
  },

  async materias(sessao: Sessao): Promise<Materia[]> {
    const r = await ler<{ materias: Materia[] }>(
      await fetch(`${BASE}/materias`, { headers: cabecalhos(sessao) }),
    );
    return r.materias;
  },

  async materia(sessao: Sessao, id: string): Promise<Materia> {
    const r = await ler<{ materia: Materia }>(
      await fetch(`${BASE}/materias/${id}`, { headers: cabecalhos(sessao) }),
    );
    return r.materia;
  },

  /** Manda o PDF e recebe o id da tarefa; a geracao continua no servidor. */
  async enviarPdf(
    sessao: Sessao,
    arquivo: { uri: string; nome: string; tipo?: string },
  ): Promise<{ tarefaId: string }> {
    const forma = new FormData();
    // No React Native o FormData aceita {uri,name,type}; na web precisa de Blob.
    if (arquivo.uri.startsWith('blob:') || arquivo.uri.startsWith('data:')) {
      const blob = await (await fetch(arquivo.uri)).blob();
      forma.append('arquivo', blob, arquivo.nome);
    } else {
      forma.append('arquivo', {
        uri: arquivo.uri,
        name: arquivo.nome,
        type: arquivo.tipo ?? 'application/pdf',
      } as unknown as Blob);
    }
    return ler(
      await fetch(`${BASE}/materias`, {
        method: 'POST',
        headers: cabecalhos(sessao),
        body: forma,
      }),
    );
  },

  async gerarTema(
    sessao: Sessao,
    materiaId: string,
    temaId: string,
  ): Promise<{ tarefaId?: string }> {
    return ler(
      await fetch(`${BASE}/materias/${materiaId}/temas/${temaId}/gerar`, {
        method: 'POST',
        headers: cabecalhos(sessao),
      }),
    );
  },

  async tarefa(sessao: Sessao, id: string): Promise<Tarefa> {
    return ler(await fetch(`${BASE}/tarefas/${id}`, { headers: cabecalhos(sessao) }));
  },

  async concluir(
    sessao: Sessao,
    materiaId: string,
    temaId: string,
    respostas: unknown[],
  ): Promise<ResultadoConclusao> {
    return ler(
      await fetch(`${BASE}/progresso/concluir`, {
        method: 'POST',
        headers: cabecalhos(sessao, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ materiaId, temaId, respostas }),
      }),
    );
  },
};

/** Acompanha uma tarefa ate o fim, avisando o progresso pelo caminho. */
export async function acompanharTarefa(
  sessao: Sessao,
  tarefaId: string,
  aoAndar: (t: Tarefa) => void,
  intervaloMs = 1500,
): Promise<Tarefa> {
  for (;;) {
    const t = await api.tarefa(sessao, tarefaId);
    aoAndar(t);
    if (t.estado === 'concluida' || t.estado === 'falhou') return t;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
}
