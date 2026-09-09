import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MARCOS } from '@estudaai/shared';
import { useEstado } from '../src/dados/estado';
import { Barra, Cartao } from '../src/ui/componentes';
import { Chama, Escudo } from '../src/ui/icones';
import { voltar } from '../src/ui/navegar';
import { retorno } from '../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../src/ui/tema';

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * Tela da ofensiva.
 *
 * Tudo aqui vem do servidor. O app nao decide se o dia contou — essa e a
 * decisao que o handoff pediu para ser inviolavel, e ela mora no backend.
 */
export default function Ofensiva() {
  const { perfil, metaDiaria, definirMeta } = useEstado();

  const streak = perfil?.ofensiva.streak ?? 0;
  const recorde = perfil?.ofensiva.maiorStreak ?? 0;
  const congelamentos = perfil?.ofensiva.congelamentos ?? 0;
  const diaFeito = perfil?.ofensiva.diaFeito ?? false;
  const proximo = perfil?.ofensiva.proximoMarco ?? null;
  const anterior = [...MARCOS].reverse().find((m) => m <= streak) ?? 0;
  const fracaoMarco = proximo && proximo > anterior ? (streak - anterior) / (proximo - anterior) : 1;

  const hoje = new Date();
  const semana = Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(hoje.getTime() - (6 - i) * 86_400_000);
    const ehHoje = i === 6;
    // Aproximacao visual: os dias cobertos pela ofensiva atual, de tras para frente.
    const coberto = ehHoje ? diaFeito : 6 - i < streak;
    return { letra: DIAS[dia.getDay()]!, coberto, ehHoje };
  });

  return (
    <SafeAreaView style={e.tela} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={e.rolagem}>
        <Pressable
          onPress={() => voltar('/(abas)')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={e.voltar}>← Voltar</Text>
        </Pressable>

        <View style={e.heroi}>
          <Chama tamanho={64} />
          <Text style={e.numeroGrande}>{streak}</Text>
          <Text style={e.legenda}>
            DIAS DE OFENSIVA · RECORDE {recorde}
          </Text>
        </View>

        <Cartao estilo={{ marginTop: espaco.lg }}>
          <Text style={e.tituloCartao}>Sua semana</Text>
          <View style={e.semana}>
            {semana.map((d, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                <View
                  style={[
                    e.diaCirculo,
                    d.coberto && { backgroundColor: cores.laranja, borderColor: cores.laranja },
                    d.ehHoje && !d.coberto && { borderColor: cores.laranja, borderWidth: 2.5 },
                  ]}
                >
                  {d.coberto && <Text style={e.diaConfere}>✓</Text>}
                </View>
                <Text style={e.diaLetra}>{d.letra}</Text>
              </View>
            ))}
          </View>
        </Cartao>

        <Cartao estilo={{ marginTop: espaco.md }}>
          <Text style={e.tituloCartao}>Meta de hoje</Text>
          <Text style={e.explicacao}>
            {diaFeito
              ? 'Ofensiva de hoje garantida. O resto é vantagem.'
              : 'Um tema hoje mantém a ofensiva. A meta é o extra.'}
          </Text>
          <View style={e.fichas}>
            {[
              { rotulo: 'Leve', valor: 1 },
              { rotulo: 'Normal', valor: 3 },
              { rotulo: 'Puxado', valor: 5 },
            ].map((m) => (
              <Pressable
                key={m.valor}
                onPress={() => {
                  retorno.toque();
                  definirMeta(m.valor);
                }}
                style={[e.ficha, metaDiaria === m.valor && e.fichaAtiva]}
              >
                <Text style={[e.fichaTexto, metaDiaria === m.valor && { color: cores.laranja }]}>
                  {m.rotulo} · {m.valor}
                </Text>
              </Pressable>
            ))}
          </View>
        </Cartao>

        <Cartao estilo={{ marginTop: espaco.md }}>
          <Text style={e.tituloCartao}>Congelamentos</Text>
          <View style={e.escudos}>
            {[0, 1].map((i) => (
              <View key={i} style={{ opacity: congelamentos > i ? 1 : 0.25 }}>
                <Escudo tamanho={34} />
              </View>
            ))}
          </View>
          <Text style={e.explicacao}>
            Cada congelamento cobre um dia sem estudar. Você tem {congelamentos} de 2.
          </Text>
        </Cartao>

        <Cartao estilo={{ marginTop: espaco.md, marginBottom: espaco.xl }}>
          <Text style={e.tituloCartao}>
            {proximo ? `Próximo marco: ${proximo} dias` : 'Você virou lenda'}
          </Text>
          <View style={{ marginVertical: espaco.md }}>
            <Barra valor={fracaoMarco} altura={12} />
          </View>
          <Text style={e.explicacao}>
            {proximo
              ? `Faltam ${proximo - streak} dia${proximo - streak === 1 ? '' : 's'}.`
              : 'Continua — o hábito já é seu.'}
          </Text>
        </Cartao>
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { padding: espaco.lg + 2 },
  voltar: { color: cores.textoFraco, fontWeight: '800', fontSize: tamanho.pequeno + 1, marginBottom: espaco.md },
  heroi: { alignItems: 'center', paddingVertical: espaco.lg },
  numeroGrande: { fontWeight: '800', fontSize: 64, color: cores.laranja, marginTop: espaco.sm },
  legenda: { fontWeight: '800', fontSize: tamanho.mini, color: cores.textoFraco, letterSpacing: 0.6 },
  tituloCartao: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.texto, marginBottom: espaco.md },
  semana: { flexDirection: 'row', justifyContent: 'space-between' },
  diaCirculo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: cores.borda,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaConfere: { color: '#fff', fontWeight: '800', fontSize: tamanho.pequeno },
  diaLetra: { fontWeight: '800', fontSize: tamanho.mini, color: cores.textoFraco },
  explicacao: { fontWeight: '700', fontSize: tamanho.pequeno, color: cores.textoFraco, lineHeight: 19 },
  fichas: { flexDirection: 'row', gap: espaco.sm, marginTop: espaco.md },
  ficha: {
    flex: 1,
    borderWidth: 2,
    borderColor: cores.borda,
    borderRadius: raio.sm + 2,
    paddingVertical: espaco.sm + 2,
    alignItems: 'center',
  },
  fichaAtiva: { borderColor: cores.laranja, backgroundColor: cores.laranjaClaro },
  fichaTexto: { fontWeight: '800', fontSize: tamanho.mini + 1, color: cores.texto },
  escudos: { flexDirection: 'row', gap: espaco.md, marginBottom: espaco.md },
});
