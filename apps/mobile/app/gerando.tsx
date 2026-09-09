import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstado, useSessao } from '../src/dados/estado';
import { acompanharTarefa } from '../src/api/cliente';
import { Aviso, Barra, Botao } from '../src/ui/componentes';
import { Livro } from '../src/ui/icones';
import { retorno } from '../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../src/ui/tema';

/**
 * Tela de espera da geracao.
 *
 * A geracao roda no servidor, entao esta tela so acompanha: sair dela nao
 * cancela nada. O texto muda a cada etapa porque uma barra sozinha, parada por
 * um minuto e meio, parece travamento.
 */
export default function Gerando() {
  const { tarefaId, materiaId } = useLocalSearchParams<{ tarefaId: string; materiaId?: string }>();
  const { recarregar } = useEstado();
  const sessao = useSessao();
  const [etapa, setEtapa] = useState('Preparando…');
  const [progresso, setProgresso] = useState(0.05);
  const [falha, setFalha] = useState<{ mensagem: string; podeTentar: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!tarefaId) return;
    let vivo = true;

    void (async () => {
      try {
        const tarefa = await acompanharTarefa(sessao, tarefaId, (t) => {
          if (!vivo) return;
          setEtapa(t.etapa);
          setProgresso(Math.max(0.05, t.progresso));
        });
        if (!vivo) return;

        if (tarefa.estado === 'falhou') {
          retorno.erro();
          setFalha({
            mensagem: tarefa.falha?.mensagem ?? 'A geração falhou.',
            podeTentar: tarefa.falha?.adiantaTentarDeNovo ?? true,
          });
          return;
        }

        await recarregar();
        retorno.conquista();
        const destino = tarefa.resultado?.materiaId ?? materiaId;
        router.replace(destino ? `/materia/${destino}` : '/(abas)');
      } catch {
        if (vivo) {
          setFalha({
            mensagem: 'Perdi contato com o servidor. A geração pode ter continuado — volte e confira a matéria.',
            podeTentar: true,
          });
        }
      }
    })();

    return () => {
      vivo = false;
    };
  }, [tarefaId, materiaId, sessao, recarregar, router]);

  return (
    <SafeAreaView style={e.tela} edges={['top', 'bottom']}>
      <View style={e.centro}>
        <Pulsando>
          <View style={e.marca}>
            <Livro tamanho={44} />
          </View>
        </Pulsando>

        {falha ? (
          <>
            <Text style={e.etapa}>Não deu dessa vez</Text>
            <Aviso texto={falha.mensagem} />
            <View style={{ width: '100%', gap: espaco.md, marginTop: espaco.lg }}>
              <Botao titulo="Voltar" aoTocar={() => router.replace('/(abas)')} />
            </View>
          </>
        ) : (
          <>
            <Text style={e.etapa}>{etapa}</Text>
            <Text style={e.dica}>
              Isso leva um ou dois minutos. Pode fechar o app: a geração continua no servidor.
            </Text>
            <View style={{ width: '100%', marginTop: espaco.xl }}>
              <Barra valor={progresso} />
            </View>
            <Text style={e.porcento}>{Math.round(progresso * 100)}%</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Respiracao lenta: sinal de vida enquanto a barra nao anda. */
function Pulsando({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [anim]);

  return (
    <Animated.View
      style={{ transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaco.xl },
  marca: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: cores.laranja,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.xl,
  },
  etapa: { fontWeight: '800', fontSize: tamanho.h3, color: cores.texto, textAlign: 'center' },
  dica: {
    color: cores.textoFraco,
    fontWeight: '700',
    fontSize: tamanho.pequeno,
    marginTop: espaco.sm,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 300,
  },
  porcento: { color: cores.textoFraco, fontWeight: '800', fontSize: tamanho.pequeno, marginTop: espaco.sm },
});
