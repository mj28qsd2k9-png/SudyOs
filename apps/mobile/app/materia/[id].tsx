import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { temaFoiGerado, type Materia, type Tema } from '@estudaai/shared';
import { useEstado } from '../../src/dados/estado';
import { api, ErroApi } from '../../src/api/cliente';
import { Aviso, Cartao, EmCascata, Subtitulo, Titulo } from '../../src/ui/componentes';
import { Confere } from '../../src/ui/icones';
import { voltar } from '../../src/ui/navegar';
import { retorno } from '../../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../../src/ui/tema';

export default function TelaMateria() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pronto, sessao, perfil } = useEstado();
  const [materia, setMateria] = useState<Materia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const router = useRouter();

  const carregar = useCallback(async () => {
    // Idem trilha: buscar antes da sessao carregar da um 404 enganoso.
    if (!pronto || !id) return;
    try {
      setMateria(await api.materia(sessao, id));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não consegui carregar essa matéria.');
    }
  }, [pronto, id, sessao]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const gerar = async (tema: Tema) => {
    if (!materia) return;
    retorno.toque();
    setGerando(tema.id);
    try {
      const r = await api.gerarTema(sessao, materia.id, tema.id);
      if (r.tarefaId) {
        router.push({ pathname: '/gerando', params: { tarefaId: r.tarefaId, materiaId: materia.id } });
      } else {
        await carregar(); // ja estava pronto
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não consegui gerar esse tema agora.');
    } finally {
      setGerando(null);
    }
  };

  const semCota = perfil?.cota && !perfil.cota.ilimitada && (perfil.cota.temasRestantes ?? 0) < 1;

  return (
    <SafeAreaView style={e.tela} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={e.rolagem}>
        <Pressable
          onPress={() => voltar('/(abas)')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Voltar para as matérias"
        >
          <Text style={e.voltar}>← Matérias</Text>
        </Pressable>

        <Titulo>{materia?.nome ?? 'Carregando…'}</Titulo>
        {materia && (
          <Subtitulo>
            {materia.temas.length} temas. Gere o que quiser com a sua cota e estude.
          </Subtitulo>
        )}

        {erro && <Aviso texto={erro} />}

        {materia?.temas.map((tema, i) => {
          const pronto = temaFoiGerado(tema);
          return (
            <EmCascata key={tema.id} indice={i}>
              <Cartao
                estilo={e.tema}
                testID={pronto ? 'tema-pronto' : 'tema-trancado'}
                rotulo={pronto ? `Estudar ${tema.nome}` : undefined}
                aoTocar={
                  pronto
                    ? () => {
                        retorno.toque();
                        router.push(`/trilha/${materia.id}/${tema.id}`);
                      }
                    : undefined
                }
              >
                <View style={[e.bolha, pronto ? e.bolhaPronta : e.bolhaTrancada]}>
                  {pronto ? (
                    <Confere tamanho={20} />
                  ) : (
                    <Text style={e.bolhaTexto}>{i + 1}</Text>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={e.nomeTema}>{tema.nome}</Text>
                  <Text style={e.metaTema} numberOfLines={2}>
                    {pronto
                      ? `${tema.aula ? 'Aula + ' : ''}${tema.questoes?.length ?? 0} questões`
                      : tema.conceito || 'Toque em Gerar para criar a trilha'}
                  </Text>
                </View>

                {!pronto && (
                  <Pressable
                    onPress={() => void gerar(tema)}
                    disabled={gerando !== null || !!semCota}
                    accessibilityRole="button"
                    accessibilityLabel={`Gerar a trilha de ${tema.nome}`}
                    testID="gerar-tema"
                    style={({ pressed }) => [
                      e.botaoGerar,
                      (gerando !== null || semCota) && { opacity: 0.5 },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={e.botaoGerarTexto}>
                      {gerando === tema.id ? '...' : 'Gerar'}
                    </Text>
                  </Pressable>
                )}
              </Cartao>
            </EmCascata>
          );
        })}

        {semCota && <Aviso texto="Cota do mês esgotada — os temas restantes liberam na virada do mês." />}
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { padding: espaco.lg + 2, paddingBottom: espaco.xxl },
  voltar: { color: cores.textoFraco, fontWeight: '800', fontSize: tamanho.pequeno + 1, marginBottom: espaco.sm },
  tema: { flexDirection: 'row', alignItems: 'center', gap: espaco.md + 2, marginTop: espaco.md },
  bolha: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4 },
  bolhaPronta: { backgroundColor: cores.verde, borderBottomColor: cores.verdeEscuro },
  bolhaTrancada: { backgroundColor: cores.desabilitado, borderBottomColor: cores.desabilitadoEscuro },
  bolhaTexto: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.desabilitadoTexto },
  nomeTema: { fontWeight: '800', fontSize: tamanho.pequeno + 1.5, color: cores.texto },
  metaTema: { color: cores.textoFraco, fontWeight: '700', fontSize: tamanho.mini + 1, marginTop: 3, lineHeight: 16 },
  botaoGerar: {
    backgroundColor: cores.coral,
    borderBottomWidth: 3,
    borderBottomColor: '#D85A2A',
    borderRadius: raio.sm + 1,
    paddingVertical: 9,
    paddingHorizontal: espaco.md,
  },
  botaoGerarTexto: { color: '#fff', fontWeight: '800', fontSize: tamanho.mini + 1 },
});
