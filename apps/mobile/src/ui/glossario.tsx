import React, { createContext, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { fatiarPorTermos, type Termo } from '@estudaai/shared';
import { cores, espaco, fonte, raio, tamanho } from './tema';
import { retorno } from './retorno';

/**
 * Glossario no toque — a dica de palavra do Duolingo, trazida para apostila.
 *
 * La, palavra que o aluno nunca viu aparece destacada e um toque mostra o
 * significado; o proposito declarado e que ninguem trave por vocabulario,
 * porque travar por vocabulario nao ensina nada, so faz desistir. Em
 * contabilidade isso pesa mais do que em idioma: "regime de competencia" e
 * "realizavel a longo prazo" sao exatamente onde a leitura para.
 *
 * O destaque e discreto de proposito — sublinhado pontilhado, sem cor berrante.
 * Uma aula com dez palavras pintadas de laranja vira um texto que ninguem le.
 */

type Contexto = {
  termos: Termo[];
  abrir: (termo: Termo) => void;
};

const GlossarioContexto = createContext<Contexto>({ termos: [], abrir: () => {} });

export function ProvedorGlossario({
  termos,
  children,
}: {
  termos: Termo[];
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState<Termo | null>(null);

  const valor = useMemo<Contexto>(
    () => ({
      termos,
      abrir: (termo) => {
        retorno.toque();
        setAberto(termo);
      },
    }),
    [termos],
  );

  return (
    <GlossarioContexto.Provider value={valor}>
      {children}
      <Modal
        visible={aberto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAberto(null)}
      >
        <Pressable style={e.fundo} onPress={() => setAberto(null)}>
          {/* O toque dentro da folha nao pode fechar a folha. */}
          <Pressable style={e.folha} onPress={() => {}}>
            <View style={e.puxador} />
            <Text style={e.termo}>{aberto?.termo}</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              <Text style={e.significado}>{aberto?.significado}</Text>
            </ScrollView>
            <Pressable
              onPress={() => setAberto(null)}
              style={e.entendi}
              accessibilityRole="button"
            >
              <Text style={e.entendiTexto}>ENTENDI</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </GlossarioContexto.Provider>
  );
}

/** Texto comum, com os termos do glossario clicaveis. */
export function TextoComTermos({
  children,
  estilo,
}: {
  children: string;
  estilo?: StyleProp<TextStyle>;
}) {
  const { termos, abrir } = useContext(GlossarioContexto);
  const pedacos = useMemo(() => fatiarPorTermos(children, termos), [children, termos]);

  if (pedacos.length === 1 && !pedacos[0]!.termo) return <Text style={estilo}>{children}</Text>;

  return (
    <Text style={estilo}>
      {pedacos.map((p, i) =>
        p.termo ? (
          <Text
            key={i}
            style={e.destaque}
            onPress={() => abrir(p.termo!)}
            accessibilityRole="button"
            accessibilityLabel={`${p.texto}: ver o que significa`}
          >
            {p.texto}
          </Text>
        ) : (
          <Text key={i}>{p.texto}</Text>
        ),
      )}
    </Text>
  );
}

/** Lista do glossario inteiro, para o fim da aula. */
export function ListaGlossario({ termos }: { termos: Termo[] }) {
  const { abrir } = useContext(GlossarioContexto);
  if (termos.length === 0) return null;

  return (
    <View style={e.lista}>
      <Text style={e.tituloLista}>Palavras deste tema</Text>
      <View style={e.pilulas}>
        {termos.map((t) => (
          <Pressable
            key={t.termo}
            onPress={() => abrir(t)}
            style={e.pilula}
            accessibilityRole="button"
            accessibilityLabel={`${t.termo}: ver o que significa`}
          >
            <Text style={e.pilulaTexto}>{t.termo}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  destaque: {
    color: cores.laranjaEscuro,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(74,59,50,0.45)',
    justifyContent: 'flex-end',
  },
  folha: {
    backgroundColor: cores.card,
    // No celular a folha ocupa a largura toda; numa tela larga, esticar uma
    // frase de 12 palavras por 1400px so torna a leitura pior.
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderTopLeftRadius: raio.xl,
    borderTopRightRadius: raio.xl,
    padding: espaco.xl,
    paddingBottom: espaco.xxl,
    gap: espaco.md,
  },
  puxador: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: raio.pilula,
    backgroundColor: cores.borda,
    marginBottom: espaco.xs,
  },
  termo: { ...fonte.titulo, fontSize: tamanho.h2, color: cores.texto },
  significado: { ...fonte.corpo, fontSize: tamanho.corpo, color: cores.textoFraco, lineHeight: 24 },
  entendi: {
    marginTop: espaco.sm,
    backgroundColor: cores.creme,
    borderRadius: raio.md,
    paddingVertical: espaco.md,
    alignItems: 'center',
  },
  entendiTexto: { ...fonte.titulo, color: cores.laranjaEscuro, letterSpacing: 0.5 },
  lista: { marginTop: espaco.xl, gap: espaco.sm },
  tituloLista: { ...fonte.titulo, fontSize: tamanho.corpo, color: cores.textoFraco },
  pilulas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  pilula: {
    backgroundColor: cores.creme,
    borderRadius: raio.pilula,
    paddingVertical: espaco.sm,
    paddingHorizontal: espaco.md,
  },
  pilulaTexto: { ...fonte.corpo, color: cores.laranjaEscuro, fontSize: tamanho.pequeno },
});
