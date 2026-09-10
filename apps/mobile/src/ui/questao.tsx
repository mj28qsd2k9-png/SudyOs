import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Questao } from '@estudaai/shared';
import { retorno } from './retorno';
import { cores, espaco, raio, tamanho } from './tema';
import { TextoComTermos } from './glossario';

/**
 * Os 7 tipos de exercicio.
 *
 * Cada tipo devolve a resposta no formato que `corrigir()` do pacote
 * compartilhado espera — a mesma funcao que o servidor usa para pontuar. O app
 * mostra o resultado na hora para o aluno aprender; quem conta o placar de
 * verdade continua sendo o servidor.
 */

export type EstadoResposta = {
  resposta: unknown;
  pronta: boolean;
};

/** `correcao` e `null` enquanto o aluno responde; preenchida depois de verificar. */
type Props<T extends Questao = Questao> = {
  questao: T;
  correcao: boolean | null;
  aoMudar: (e: EstadoResposta) => void;
};

type PorTipo<T extends Questao['tipo']> = Props<Extract<Questao, { tipo: T }>>;

export function RenderQuestao({ questao, correcao, aoMudar }: Props) {
  switch (questao.tipo) {
    case 'mc':
    case 'calc':
    case 'cenario':
      return <Alternativas questao={questao} correcao={correcao} aoMudar={aoMudar} />;
    case 'tf':
      return <VerdadeiroFalso questao={questao} correcao={correcao} aoMudar={aoMudar} />;
    case 'fill':
      return <Lacuna questao={questao} correcao={correcao} aoMudar={aoMudar} />;
    case 'match':
      return <Pares questao={questao} correcao={correcao} aoMudar={aoMudar} />;
    case 'ordenar':
      return <Ordenar questao={questao} correcao={correcao} aoMudar={aoMudar} />;
  }
}

export function rotuloDoTipo(q: Questao): string {
  switch (q.tipo) {
    case 'mc':
      return 'Escolha a correta';
    case 'calc':
      return 'Calcule';
    case 'cenario':
      return 'Estudo de caso';
    case 'tf':
      return 'Verdadeiro ou falso';
    case 'fill':
      return 'Complete a frase';
    case 'match':
      return 'Ligue os pares';
    case 'ordenar':
      return 'Coloque em ordem';
  }
}

function Alternativas({ questao, correcao, aoMudar }: PorTipo<'mc' | 'calc' | 'cenario'>) {
  const [escolha, setEscolha] = useState<number | null>(null);
  useEffect(() => {
    setEscolha(null);
  }, [questao.id]);

  return (
    <View>
      {questao.tipo === 'cenario' && questao.contexto ? (
        <View style={e.contexto}>
          <TextoComTermos estilo={e.contextoTexto}>{questao.contexto}</TextoComTermos>
        </View>
      ) : null}

      <TextoComTermos estilo={e.enunciado}>{questao.pergunta}</TextoComTermos>

      <View style={{ gap: espaco.sm + 2 }}>
        {questao.opcoes.map((opcao, i) => (
          <Pressable
            key={`${questao.id}-${i}`}
            disabled={correcao !== null}
            accessibilityRole="radio"
            accessibilityState={{ checked: escolha === i, disabled: correcao !== null }}
            accessibilityLabel={`Alternativa ${i + 1}: ${opcao}`}
            testID="alternativa"
            onPress={() => {
              retorno.toque();
              setEscolha(i);
              aoMudar({ resposta: i, pronta: true });
            }}
            style={[
              e.opcao,
              escolha === i && correcao === null && e.opcaoEscolhida,
              correcao !== null && i === questao.correta && e.opcaoCerta,
              correcao !== null && escolha === i && i !== questao.correta && e.opcaoErrada,
              correcao !== null && i !== questao.correta && escolha !== i && { opacity: 0.45 },
            ]}
          >
            <Text
              style={[
                e.opcaoTexto,
                correcao !== null && i === questao.correta && { color: cores.verdeEscuro },
                correcao !== null && escolha === i && i !== questao.correta && { color: cores.vermelho },
              ]}
            >
              {opcao}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function VerdadeiroFalso({ questao, correcao, aoMudar }: PorTipo<'tf'>) {
  const [escolha, setEscolha] = useState<boolean | null>(null);
  useEffect(() => {
    setEscolha(null);
  }, [questao.id]);

  const botoes: { rotulo: string; valor: boolean }[] = [
    { rotulo: 'Verdadeiro', valor: true },
    { rotulo: 'Falso', valor: false },
  ];

  return (
    <View>
      <TextoComTermos estilo={e.enunciado}>{questao.pergunta}</TextoComTermos>
      <View style={{ flexDirection: 'row', gap: espaco.md }}>
        {botoes.map((b) => (
          <Pressable
            key={b.rotulo}
            disabled={correcao !== null}
            accessibilityRole="radio"
            accessibilityState={{ checked: escolha === b.valor, disabled: correcao !== null }}
            accessibilityLabel={b.rotulo}
            testID="alternativa"
            onPress={() => {
              retorno.toque();
              setEscolha(b.valor);
              aoMudar({ resposta: b.valor, pronta: true });
            }}
            style={[
              e.opcao,
              { flex: 1, alignItems: 'center' },
              escolha === b.valor && correcao === null && e.opcaoEscolhida,
              correcao !== null && b.valor === questao.resposta && e.opcaoCerta,
              correcao !== null && escolha === b.valor && b.valor !== questao.resposta && e.opcaoErrada,
            ]}
          >
            <Text style={[e.opcaoTexto, { fontSize: tamanho.h3 - 2 }]}>{b.rotulo}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Lacuna({ questao, correcao, aoMudar }: PorTipo<'fill'>) {
  const [escolha, setEscolha] = useState<number | null>(null);
  useEffect(() => {
    setEscolha(null);
  }, [questao.id]);

  const preenchido = escolha === null ? '?' : questao.opcoes[escolha];

  return (
    <View>
      <Text style={e.frase}>
        {questao.antes}
        <Text style={e.vao}>{` ${preenchido} `}</Text>
        {questao.depois}
      </Text>

      <View style={e.fichas}>
        {questao.opcoes.map((opcao, i) => (
          <Pressable
            key={`${questao.id}-${i}`}
            disabled={correcao !== null}
            accessibilityRole="radio"
            accessibilityState={{ checked: escolha === i, disabled: correcao !== null }}
            accessibilityLabel={`Preencher com ${opcao}`}
            testID="alternativa"
            onPress={() => {
              retorno.toque();
              setEscolha(i);
              aoMudar({ resposta: i, pronta: true });
            }}
            style={[
              e.ficha,
              escolha === i && correcao === null && e.opcaoEscolhida,
              correcao !== null && i === questao.correta && e.opcaoCerta,
              correcao !== null && escolha === i && i !== questao.correta && e.opcaoErrada,
            ]}
          >
            <Text style={e.opcaoTexto}>{opcao}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Ligar pares.
 *
 * O jogo so termina quando todos os pares batem, entao acertar e a unica saida
 * — igual ao prototipo, e igual ao que `corrigir()` assume no servidor. Errar
 * aqui custa uma tentativa, nao um ponto.
 */
function Pares({ questao, aoMudar }: PorTipo<'match'>) {
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [ligados, setLigados] = useState<number[]>([]);
  const [erroEm, setErroEm] = useState<number | null>(null);

  const direita = useMemo(() => {
    const lista = questao.pares.map((p, i) => ({ texto: p[1], indice: i }));
    for (let i = lista.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [lista[i], lista[j]] = [lista[j]!, lista[i]!];
    }
    return lista;
  }, [questao.id, questao.pares]);

  useEffect(() => {
    setSelecionado(null);
    setLigados([]);
  }, [questao.id]);

  const tocarDireita = (indice: number) => {
    if (selecionado === null) return;
    if (selecionado === indice) {
      retorno.acerto();
      const novos = [...ligados, indice];
      setLigados(novos);
      setSelecionado(null);
      if (novos.length === questao.pares.length) aoMudar({ resposta: true, pronta: true });
    } else {
      retorno.erro();
      setErroEm(indice);
      setTimeout(() => setErroEm(null), 400);
      setSelecionado(null);
    }
  };

  return (
    <View>
      <Text style={e.instrucao}>Toque no termo e depois na definição que combina.</Text>
      <View style={{ flexDirection: 'row', gap: espaco.md }}>
        <View style={{ flex: 1, gap: espaco.sm + 2 }}>
          {questao.pares.map((par, i) => (
            <Pressable
              key={`e-${i}`}
              disabled={ligados.includes(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: selecionado === i, disabled: ligados.includes(i) }}
              accessibilityLabel={`Termo: ${par[0]}`}
              testID="par-termo"
              onPress={() => {
                retorno.toque();
                setSelecionado(i);
              }}
              style={[
                e.itemPar,
                selecionado === i && e.opcaoEscolhida,
                ligados.includes(i) && e.opcaoCerta,
              ]}
            >
              <Text style={e.textoPar}>{par[0]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1, gap: espaco.sm + 2 }}>
          {direita.map((d) => (
            <Pressable
              key={`d-${d.indice}`}
              disabled={ligados.includes(d.indice)}
              accessibilityRole="button"
              accessibilityState={{ disabled: ligados.includes(d.indice) }}
              accessibilityLabel={`Definição: ${d.texto}`}
              testID="par-definicao"
              onPress={() => tocarDireita(d.indice)}
              style={[
                e.itemPar,
                ligados.includes(d.indice) && e.opcaoCerta,
                erroEm === d.indice && e.opcaoErrada,
              ]}
            >
              <Text style={e.textoPar}>{d.texto}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function Ordenar({ questao, correcao, aoMudar }: PorTipo<'ordenar'>) {
  const embaralhado = useMemo(() => {
    const lista = [...questao.ordem_correta];
    for (let i = lista.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [lista[i], lista[j]] = [lista[j]!, lista[i]!];
    }
    return lista;
  }, [questao.id, questao.ordem_correta]);

  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  useEffect(() => {
    setEscolhidos([]);
  }, [questao.id]);

  const atualizar = (lista: string[]) => {
    setEscolhidos(lista);
    aoMudar({ resposta: lista, pronta: lista.length === questao.ordem_correta.length });
  };

  return (
    <View>
      <TextoComTermos estilo={e.enunciado}>{questao.instrucao}</TextoComTermos>

      <View style={e.areaResposta}>
        {escolhidos.length === 0 ? (
          <Text style={e.dicaVazio}>Toque nos itens na ordem certa…</Text>
        ) : (
          escolhidos.map((item, i) => (
            <Pressable
              key={`r-${item}`}
              disabled={correcao !== null}
              accessibilityRole="button"
              accessibilityLabel={`${item}, posição ${i + 1}. Toque para tirar da resposta.`}
              testID="ordem-escolhido"
              onPress={() => {
                retorno.toque();
                atualizar(escolhidos.filter((x) => x !== item));
              }}
              style={[
                e.itemOrdem,
                e.opcaoEscolhida,
                correcao !== null &&
                  (questao.ordem_correta[i] === item ? e.opcaoCerta : e.opcaoErrada),
              ]}
            >
              <View style={e.numeroOrdem}>
                <Text style={e.numeroOrdemTexto}>{i + 1}</Text>
              </View>
              <Text style={e.textoOrdem}>{item}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={e.fichas}>
        {embaralhado
          .filter((item) => !escolhidos.includes(item))
          .map((item) => (
            <Pressable
              key={`p-${item}`}
              disabled={correcao !== null}
              accessibilityRole="button"
              accessibilityLabel={`Adicionar ${item} à resposta`}
              testID="ordem-disponivel"
              onPress={() => {
                retorno.toque();
                atualizar([...escolhidos, item]);
              }}
              style={e.itemOrdem}
            >
              <Text style={e.textoOrdem}>{item}</Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  contexto: { backgroundColor: cores.creme, borderRadius: raio.lg, padding: espaco.lg, marginBottom: espaco.md + 2 },
  contextoTexto: { fontWeight: '700', fontSize: tamanho.corpo, lineHeight: 23, color: cores.texto },
  enunciado: { fontWeight: '700', fontSize: tamanho.corpo + 1.5, lineHeight: 25, color: cores.texto, marginBottom: espaco.lg + 2 },
  instrucao: { fontWeight: '700', fontSize: tamanho.pequeno + 1, color: cores.textoFraco, marginBottom: espaco.md + 2 },
  opcao: {
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: cores.borda,
    borderRadius: raio.md + 1,
    paddingVertical: espaco.md + 2,
    paddingHorizontal: espaco.lg,
    backgroundColor: cores.card,
  },
  opcaoEscolhida: { borderColor: cores.laranja, backgroundColor: cores.laranjaClaro },
  opcaoCerta: { borderColor: cores.verde, backgroundColor: cores.verdeFundo },
  opcaoErrada: { borderColor: cores.vermelho, backgroundColor: cores.vermelhoFundo },
  opcaoTexto: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.texto, lineHeight: 21 },
  frase: { fontWeight: '700', fontSize: tamanho.h3, lineHeight: 30, color: cores.texto, marginBottom: espaco.xl },
  vao: { color: cores.laranja, fontWeight: '800', textDecorationLine: 'underline' },
  fichas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm + 2 },
  ficha: {
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingVertical: espaco.sm + 2,
    paddingHorizontal: espaco.lg,
    backgroundColor: cores.card,
  },
  itemPar: {
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: cores.borda,
    borderRadius: raio.md,
    padding: espaco.md,
    backgroundColor: cores.card,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoPar: { fontWeight: '800', fontSize: tamanho.pequeno + 0.5, color: cores.texto, textAlign: 'center', lineHeight: 18 },
  areaResposta: {
    minHeight: 60,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: cores.borda,
    borderRadius: raio.md,
    padding: espaco.sm + 1,
    gap: espaco.sm,
    marginBottom: espaco.md + 2,
    justifyContent: 'center',
  },
  dicaVazio: { color: cores.textoFraco, fontWeight: '700', fontSize: tamanho.pequeno, textAlign: 'center' },
  itemOrdem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: cores.borda,
    borderRadius: raio.sm + 2,
    paddingVertical: espaco.sm + 3,
    paddingHorizontal: espaco.md + 2,
    backgroundColor: cores.card,
  },
  numeroOrdem: { width: 20, height: 20, borderRadius: 10, backgroundColor: cores.laranja, alignItems: 'center', justifyContent: 'center' },
  numeroOrdemTexto: { color: '#fff', fontSize: tamanho.mini, fontWeight: '800' },
  textoOrdem: { fontWeight: '800', fontSize: tamanho.pequeno + 1, color: cores.texto },
});
