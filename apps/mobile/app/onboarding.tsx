import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstado } from '../src/dados/estado';
import { Botao, EmCascata } from '../src/ui/componentes';
import { Chama, Livro } from '../src/ui/icones';
import { retorno } from '../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../src/ui/tema';

const OBJETIVOS = [
  { rotulo: 'Faculdade', sigla: 'FAC' },
  { rotulo: 'Concurso', sigla: 'CON' },
  { rotulo: 'Escola / ENEM', sigla: 'ESC' },
  { rotulo: 'Idiomas', sigla: 'IDI' },
  { rotulo: 'Outro', sigla: 'OUT' },
];

export default function Onboarding() {
  const [passo, setPasso] = useState(0);
  const [objetivo, setObjetivo] = useState<string | null>(null);
  const { concluirOnboarding } = useEstado();
  const router = useRouter();

  const avancar = async () => {
    retorno.toque();
    if (passo < 2) {
      setPasso(passo + 1);
      return;
    }
    await concluirOnboarding(objetivo);
    router.replace('/(abas)');
  };

  return (
    <SafeAreaView style={e.tela} edges={['top', 'bottom']}>
      <View style={e.conteudo}>
        {passo === 0 && <Boas />}
        {passo === 1 && <Objetivo escolhido={objetivo} aoEscolher={setObjetivo} />}
        {passo === 2 && <Habito />}
      </View>

      <View style={e.rodape}>
        <View style={e.pontos}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[e.ponto, i === passo && e.pontoAtivo]} />
          ))}
        </View>
        <Botao
          titulo={passo === 0 ? 'Começar' : passo === 1 ? 'Continuar' : 'Bora estudar'}
          aoTocar={avancar}
        />
        {passo === 1 && (
          <Pressable onPress={avancar} hitSlop={12}>
            <Text style={e.pular}>Depois eu escolho</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function Boas() {
  return (
    <View style={e.centro}>
      <View style={e.logo}>
        <Livro tamanho={52} />
      </View>
      <Text style={e.tituloGrande}>Estuda AI</Text>
      <Text style={e.paragrafo}>
        Joga o PDF da tua matéria. A IA transforma em aula e trilha de questões, e você estuda
        jogando.
      </Text>
    </View>
  );
}

function Objetivo({
  escolhido,
  aoEscolher,
}: {
  escolhido: string | null;
  aoEscolher: (v: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingTop: espaco.xl }} showsVerticalScrollIndicator={false}>
      <Text style={e.tituloMedio}>O que você quer estudar?</Text>
      <Text style={e.paragrafoEsquerda}>Isso ajuda a IA a montar as questões do teu jeito.</Text>
      <View style={{ marginTop: espaco.xl, gap: espaco.sm + 2 }}>
        {OBJETIVOS.map((o, i) => (
          <EmCascata key={o.rotulo} indice={i}>
            <Pressable
              onPress={() => {
                retorno.toque();
                aoEscolher(o.rotulo);
              }}
              style={[e.opcao, escolhido === o.rotulo && e.opcaoEscolhida]}
            >
              <View style={e.sigla}>
                <Text style={e.siglaTexto}>{o.sigla}</Text>
              </View>
              <Text style={[e.opcaoTexto, escolhido === o.rotulo && { color: cores.laranja }]}>
                {o.rotulo}
              </Text>
            </Pressable>
          </EmCascata>
        ))}
      </View>
    </ScrollView>
  );
}

function Habito() {
  return (
    <View style={e.centro}>
      <View style={[e.logo, { backgroundColor: cores.amarelo }]}>
        <Chama tamanho={52} cor="#fff" />
      </View>
      <Text style={e.tituloGrande}>Bora criar o hábito</Text>
      <Text style={e.paragrafo}>
        Um tema por dia mantém sua ofensiva acesa. É assim que o conteúdo gruda — não é decorando
        na véspera.
      </Text>
    </View>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flex: 1, paddingHorizontal: espaco.xl },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: cores.laranja,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.xl,
  },
  tituloGrande: { fontSize: 30, fontWeight: '800', color: cores.texto, textAlign: 'center' },
  tituloMedio: { fontSize: tamanho.h1, fontWeight: '800', color: cores.texto },
  paragrafo: {
    color: cores.textoFraco,
    fontWeight: '700',
    fontSize: tamanho.corpo,
    marginTop: espaco.md,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  paragrafoEsquerda: {
    color: cores.textoFraco,
    fontWeight: '700',
    fontSize: tamanho.pequeno + 1,
    marginTop: espaco.sm,
    lineHeight: 20,
  },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: cores.borda,
    borderRadius: raio.md + 2,
    padding: espaco.lg,
    backgroundColor: cores.card,
  },
  opcaoEscolhida: { borderColor: cores.laranja, backgroundColor: cores.laranjaClaro },
  opcaoTexto: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.texto },
  sigla: {
    width: 38,
    height: 38,
    borderRadius: raio.sm,
    backgroundColor: cores.laranjaClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siglaTexto: { fontWeight: '800', fontSize: tamanho.mini, color: cores.laranja },
  rodape: { paddingHorizontal: espaco.xl, paddingBottom: espaco.lg, gap: espaco.md },
  pontos: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: espaco.xs },
  ponto: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.borda },
  pontoAtivo: { width: 22, borderRadius: 4, backgroundColor: cores.laranja },
  pular: {
    textAlign: 'center',
    color: cores.textoFraco,
    fontWeight: '800',
    fontSize: tamanho.pequeno,
  },
});
