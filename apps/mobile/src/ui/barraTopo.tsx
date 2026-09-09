import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useEstado } from '../dados/estado';
import { Chama, Estrela } from './icones';
import { cores, espaco, raio, tamanho } from './tema';

/**
 * Barra do topo: ofensiva, XP e cota.
 *
 * Os numeros vem do servidor — o app nao calcula ofensiva nem XP, so mostra.
 */
export function BarraTopo() {
  const { perfil } = useEstado();
  const router = useRouter();

  const cota = perfil?.cota;
  const rotuloCota = !cota
    ? '—'
    : cota.ilimitada
      ? 'Modo livre'
      : `${cota.temasRestantes ?? 0} tema${cota.temasRestantes === 1 ? '' : 's'}`;

  return (
    <View style={e.barra}>
      <Pressable
        onPress={() => router.push('/ofensiva')}
        style={e.item}
        accessibilityRole="button"
        accessibilityLabel="Ver sua ofensiva"
      >
        <Chama tamanho={20} />
        <Text style={e.numero}>{perfil?.ofensiva.streak ?? 0}</Text>
      </Pressable>

      <View style={e.item}>
        <Estrela tamanho={20} />
        <Text style={e.numero}>{perfil?.xp ?? 0}</Text>
      </View>

      <View style={e.cota}>
        <Text style={e.cotaTexto}>{rotuloCota}</Text>
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
    backgroundColor: cores.fundo,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  numero: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.texto },
  cota: {
    marginLeft: 'auto',
    backgroundColor: cores.laranjaClaro,
    paddingHorizontal: espaco.md,
    paddingVertical: 5,
    borderRadius: raio.pilula,
  },
  cotaTexto: { fontWeight: '800', fontSize: tamanho.mini + 1, color: cores.laranja },
});
