import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Materia } from '@estudaai/shared';
import {
  api,
  ehSessaoMorta,
  type Credenciais,
  type Perfil,
  type Sessao,
} from '../api/cliente';
import { apagarToken, guardarToken, lerToken } from './cofre';
import { definirSom as definirSomGlobal } from '../ui/som';

/**
 * Estado do app.
 *
 * O que e verdade fica no servidor (ofensiva, cota, XP, correcao). O que mora
 * aqui e o que o aparelho precisa lembrar entre aberturas: o token da sessao (no
 * cofre), se o onboarding ja passou, a meta diaria, e as anotacoes — que o
 * backend ainda nao guarda.
 */

const CHAVE_ONBOARDING = 'estudaai:onboarding';
const CHAVE_NOTAS = 'estudaai:notas';
const CHAVE_META = 'estudaai:meta';
const CHAVE_APARELHO = 'estudaai:aparelho';
const CHAVE_SOM = 'estudaai:som';

export type Anotacao = {
  id: string;
  materiaNome: string;
  temaId: string;
  temaNome: string;
  tipo: 'grifo' | 'nota';
  texto: string;
};

type Contexto = {
  pronto: boolean;
  autenticado: boolean;
  sessao: Sessao | null;
  email: string | null;
  objetivo: string | null;
  onboardingFeito: boolean;
  metaDiaria: number;
  som: boolean;
  materias: Materia[];
  perfil: Perfil | null;
  erroRede: string | null;
  anotacoes: Anotacao[];
  entrar: (c: Credenciais) => Promise<void>;
  cadastrar: (c: Credenciais) => Promise<{ materiasTrazidas: number }>;
  sair: () => Promise<void>;
  concluirOnboarding: (objetivo: string | null) => Promise<void>;
  definirMeta: (n: number) => void;
  definirSom: (ligado: boolean) => void;
  recarregar: () => Promise<void>;
  adicionarAnotacao: (a: Omit<Anotacao, 'id'>) => void;
  removerAnotacao: (id: string) => void;
};

const Ctx = createContext<Contexto | null>(null);

function fusoDeAgora(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
}

export function ProvedorEstado({ children }: { children: React.ReactNode }) {
  const [pronto, setPronto] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [aparelho, setAparelho] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState<string | null>(null);
  const [onboardingFeito, setOnboardingFeito] = useState(false);
  const [metaDiaria, setMetaDiaria] = useState(3);
  const [som, setSom] = useState(true);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erroRede, setErroRede] = useState<string | null>(null);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [token, guardado] = await Promise.all([
          lerToken(),
          AsyncStorage.getMany([
            CHAVE_ONBOARDING,
            CHAVE_NOTAS,
            CHAVE_META,
            CHAVE_APARELHO,
            CHAVE_SOM,
          ]),
        ]);

        if (token) setSessao({ token, fuso: fusoDeAgora() });

        const onb = guardado[CHAVE_ONBOARDING];
        if (onb) {
          const salvo = JSON.parse(onb) as { feito: boolean; objetivo: string | null };
          setOnboardingFeito(salvo.feito);
          setObjetivo(salvo.objetivo);
        }
        const notas = guardado[CHAVE_NOTAS];
        if (notas) setAnotacoes(JSON.parse(notas) as Anotacao[]);
        const meta = guardado[CHAVE_META];
        if (meta) setMetaDiaria(Number(meta) || 3);
        // Som comeca ligado: e o que combate o tedio de conteudo arido, e quem
        // nao quiser desliga no perfil. So respeitamos o "nao" explicito.
        const somSalvo = guardado[CHAVE_SOM];
        const ligado = somSalvo === null || somSalvo === undefined ? true : somSalvo === '1';
        setSom(ligado);
        definirSomGlobal(ligado);

        // Id de quem usou o app antes de existir login; some depois de trazido.
        setAparelho(guardado[CHAVE_APARELHO] ?? null);
      } catch {
        // Armazenamento indisponivel nao pode impedir o app de abrir.
      } finally {
        setPronto(true);
      }
    })();
  }, []);

  const encerrarLocalmente = useCallback(async () => {
    await apagarToken();
    setSessao(null);
    setEmail(null);
    setMaterias([]);
    setPerfil(null);
  }, []);

  const recarregar = useCallback(async () => {
    if (!sessao) return;
    try {
      const [ms, p] = await Promise.all([api.materias(sessao), api.perfil(sessao)]);
      setMaterias(ms);
      setPerfil(p);
      setErroRede(null);
    } catch (erro) {
      // Sessao morta nao e falha de rede: e hora de pedir login de novo.
      if (ehSessaoMorta(erro)) {
        await encerrarLocalmente();
        return;
      }
      setErroRede(erro instanceof Error ? erro.message : 'Sem conexão com o servidor.');
    }
  }, [sessao, encerrarLocalmente]);

  useEffect(() => {
    if (pronto && sessao) void recarregar();
  }, [pronto, sessao, recarregar]);

  const aplicarSessao = useCallback(async (token: string, emailDaConta: string) => {
    await guardarToken(token);
    setSessao({ token, fuso: fusoDeAgora() });
    setEmail(emailDaConta);
  }, []);

  const entrar = useCallback(
    async (c: Credenciais) => {
      const r = await api.entrar(c, fusoDeAgora());
      await aplicarSessao(r.token, r.email);
    },
    [aplicarSessao],
  );

  const cadastrar = useCallback(
    async (c: Credenciais) => {
      const r = await api.cadastrar(c, fusoDeAgora(), aparelho ?? undefined);
      await aplicarSessao(r.token, r.email);
      // Trazido uma vez, o id do aparelho nao serve mais — e deixar guardado
      // seria manter por perto uma chave para os dados de outra conta.
      if (aparelho) {
        setAparelho(null);
        void AsyncStorage.removeItem(CHAVE_APARELHO).catch(() => {});
      }
      return { materiasTrazidas: r.materiasTrazidas ?? 0 };
    },
    [aplicarSessao, aparelho],
  );

  const sair = useCallback(async () => {
    if (sessao) await api.sair(sessao);
    await encerrarLocalmente();
  }, [sessao, encerrarLocalmente]);

  const concluirOnboarding = useCallback(async (obj: string | null) => {
    setObjetivo(obj);
    setOnboardingFeito(true);
    await AsyncStorage.setItem(
      CHAVE_ONBOARDING,
      JSON.stringify({ feito: true, objetivo: obj }),
    ).catch(() => {});
  }, []);

  const definirMeta = useCallback((n: number) => {
    setMetaDiaria(n);
    void AsyncStorage.setItem(CHAVE_META, String(n)).catch(() => {});
  }, []);

  const definirSom = useCallback((ligado: boolean) => {
    setSom(ligado);
    definirSomGlobal(ligado);
    void AsyncStorage.setItem(CHAVE_SOM, ligado ? '1' : '0').catch(() => {});
  }, []);

  const guardarNotas = useCallback((lista: Anotacao[]) => {
    setAnotacoes(lista);
    void AsyncStorage.setItem(CHAVE_NOTAS, JSON.stringify(lista)).catch(() => {});
  }, []);

  const adicionarAnotacao = useCallback(
    (a: Omit<Anotacao, 'id'>) => {
      guardarNotas([
        ...anotacoes,
        { ...a, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      ]);
    },
    [anotacoes, guardarNotas],
  );

  const removerAnotacao = useCallback(
    (id: string) => guardarNotas(anotacoes.filter((a) => a.id !== id)),
    [anotacoes, guardarNotas],
  );

  const valor = useMemo<Contexto>(
    () => ({
      pronto,
      autenticado: sessao !== null,
      sessao,
      email,
      objetivo,
      onboardingFeito,
      metaDiaria,
      som,
      materias,
      perfil,
      erroRede,
      anotacoes,
      entrar,
      cadastrar,
      sair,
      concluirOnboarding,
      definirMeta,
      definirSom,
      recarregar,
      adicionarAnotacao,
      removerAnotacao,
    }),
    [
      pronto,
      sessao,
      email,
      objetivo,
      onboardingFeito,
      metaDiaria,
      som,
      materias,
      perfil,
      erroRede,
      anotacoes,
      entrar,
      cadastrar,
      sair,
      concluirOnboarding,
      definirMeta,
      definirSom,
      recarregar,
      adicionarAnotacao,
      removerAnotacao,
    ],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useEstado(): Contexto {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEstado precisa estar dentro de ProvedorEstado');
  return ctx;
}

/**
 * Sessao garantida, para telas que ja rodam dentro da area logada.
 *
 * Sem isto, cada tela protegida precisaria tratar `sessao === null`, que ali
 * nunca acontece — e o tratamento morto acabaria escondendo o caso real.
 */
export function useSessao(): Sessao {
  const { sessao } = useEstado();
  if (!sessao) throw new Error('Tela protegida sem sessão');
  return sessao;
}
