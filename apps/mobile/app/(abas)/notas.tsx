import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstado, type Anotacao } from '../../src/dados/estado';
import { BarraTopo } from '../../src/ui/barraTopo';
import { Cartao, Subtitulo, Titulo, Vazio } from '../../src/ui/componentes';
import { retorno } from '../../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../../src/ui/tema';

/**
 * Anotacoes, agrupadas por materia e tema.
 *
 * Elas moram no aparelho: o backend ainda nao tem endpoint para grifo e nota
 * (a tabela esta desenhada em docs/ARQUITETURA.md). Trocar de aparelho perde as
 * anotacoes — e a razao de isso estar no roadmap e nao esquecido.
 */
export default function Notas() {
  const { anotacoes, removerAnotacao } = useEstado();

  const porMateria = anotacoes.reduce<Record<string, Anotacao[]>>((acc, a) => {
    (acc[a.materiaNome] ??= []).push(a);
    return acc;
  }, {});

  return (
    <SafeAreaView style={e.tela} edges={['top']}>
      <BarraTopo />
      <ScrollView contentContainerStyle={e.rolagem}>
        <Titulo>Anotações</Titulo>
        <Subtitulo>Grife trechos e escreva notas durante a aula. Tudo aparece aqui.</Subtitulo>

        {anotacoes.length === 0 && (
          <Vazio
            titulo="Você ainda não anotou nada"
            descricao="Abra uma aula, selecione um trecho e toque em Grifar, ou use o botão de nota."
          />
        )}

        {Object.entries(porMateria).map(([materia, lista]) => (
          <View key={materia} style={{ marginTop: espaco.xl }}>
            <Text style={e.materia}>{materia}</Text>
            {lista.map((a) => (
              <Cartao key={a.id} estilo={e.anotacao}>
                <View style={{ flex: 1 }}>
                  <Text style={e.tema}>{a.temaNome}</Text>
                  <Text style={[e.texto, a.tipo === 'grifo' && e.grifo]}>{a.texto}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    retorno.toque();
                    removerAnotacao(a.id);
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Apagar anotação de ${a.temaNome}`}
                >
                  <Text style={e.apagar}>✕</Text>
                </Pressable>
              </Cartao>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { padding: espaco.lg + 2, paddingBottom: espaco.xxl },
  materia: { fontSize: tamanho.h3, fontWeight: '800', color: cores.texto, marginBottom: espaco.xs },
  anotacao: { flexDirection: 'row', gap: espaco.md, marginTop: espaco.sm + 2, alignItems: 'flex-start' },
  tema: { fontWeight: '800', fontSize: tamanho.mini + 1, color: cores.laranja, marginBottom: 4 },
  texto: { fontWeight: '700', fontSize: tamanho.pequeno + 1, color: cores.texto, lineHeight: 20 },
  grifo: { backgroundColor: '#FFF2A8', borderRadius: raio.sm - 4, paddingHorizontal: 4 },
  apagar: { color: cores.textoFraco, fontWeight: '800', fontSize: tamanho.corpo },
});
