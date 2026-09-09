import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstado } from '../../src/dados/estado';
import { BarraTopo } from '../../src/ui/barraTopo';
import { Cartao, EmCascata, Subtitulo, Titulo } from '../../src/ui/componentes';
import { Alvo, Confere } from '../../src/ui/icones';
import { cores, espaco, raio, tamanho } from '../../src/ui/tema';

/**
 * Missoes.
 *
 * Sao derivadas do que o servidor ja sabe (temas concluidos, ofensiva, meta do
 * dia). Nao ha estado proprio de missao: inventar um aqui criaria uma segunda
 * fonte de verdade sobre progresso, que e exatamente o que o resto do app evita.
 */
export default function Missoes() {
  const { perfil, metaDiaria } = useEstado();

  const concluidos = perfil?.temasConcluidos ?? 0;
  const ofensiva = perfil?.ofensiva.streak ?? 0;
  const diaFeito = perfil?.ofensiva.diaFeito ?? false;

  const missoes = [
    { nome: 'Estude 1 tema hoje', feito: diaFeito ? 1 : 0, alvo: 1, xp: 10 },
    { nome: `Cumpra a meta do dia (${metaDiaria} temas)`, feito: Math.min(concluidos, metaDiaria), alvo: metaDiaria, xp: 20 },
    { nome: 'Mantenha a ofensiva acesa', feito: ofensiva > 0 ? 1 : 0, alvo: 1, xp: 15 },
    { nome: 'Chegue a 3 dias seguidos', feito: Math.min(ofensiva, 3), alvo: 3, xp: 30 },
  ];

  return (
    <SafeAreaView style={e.tela} edges={['top']}>
      <BarraTopo />
      <ScrollView contentContainerStyle={e.rolagem}>
        <Titulo>Missões</Titulo>
        <Subtitulo>Cumpra e ganhe XP. O XP compra congelamento de ofensiva.</Subtitulo>

        {missoes.map((m, i) => {
          const completa = m.feito >= m.alvo;
          return (
            <EmCascata key={m.nome} indice={i}>
              <Cartao estilo={e.missao}>
                <View style={[e.icone, completa && { backgroundColor: cores.verdeFundo }]}>
                  {completa ? <Confere tamanho={22} cor={cores.verde} /> : <Alvo cor={cores.laranja} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={e.nome}>{m.nome}</Text>
                  <View style={e.trilho}>
                    <View
                      style={[
                        e.preenchimento,
                        {
                          width: `${Math.round((Math.min(m.feito, m.alvo) / m.alvo) * 100)}%`,
                          backgroundColor: completa ? cores.verde : cores.laranja,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[e.meta, completa && { color: cores.verde }]}>
                    {completa ? 'Concluída' : `${m.feito} de ${m.alvo}`} · +{m.xp} XP
                  </Text>
                </View>
              </Cartao>
            </EmCascata>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { padding: espaco.lg + 2, paddingBottom: espaco.xxl },
  missao: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, marginTop: espaco.md },
  icone: {
    width: 44,
    height: 44,
    borderRadius: raio.md - 2,
    backgroundColor: cores.laranjaClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { fontWeight: '800', fontSize: tamanho.pequeno + 1, color: cores.texto },
  trilho: { height: 12, backgroundColor: cores.borda, borderRadius: raio.pilula, overflow: 'hidden', marginTop: 7 },
  preenchimento: { height: '100%', borderRadius: raio.pilula },
  meta: { fontWeight: '800', fontSize: tamanho.mini + 1, color: cores.textoFraco, marginTop: 5 },
});
