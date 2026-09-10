import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstado } from '../../src/dados/estado';
import { api } from '../../src/api/cliente';
import { BarraTopo } from '../../src/ui/barraTopo';
import { Botao, Cartao, Subtitulo, Titulo } from '../../src/ui/componentes';
import { Pessoa } from '../../src/ui/icones';
import { retorno } from '../../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../../src/ui/tema';

export default function Perfil() {
  const { perfil, objetivo, email, sessao, materias, sair, som, definirSom } = useEstado();
  const [saindo, setSaindo] = useState(false);
  const router = useRouter();

  const confirmarSaida = () => {
    const executar = async () => {
      setSaindo(true);
      await sair();
      // O redirecionamento e do `app/index.tsx`, que reage a sessao sumir.
      router.replace('/');
    };

    // Alert.alert nao existe na web; ali o confirm do navegador faz o papel.
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Sair da conta neste aparelho?')) void executar();
      return;
    }
    Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo neste aparelho.', [
      { text: 'Ficar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void executar() },
    ]);
  };

  const numeros = [
    { valor: perfil?.ofensiva.streak ?? 0, rotulo: 'Ofensiva', cor: cores.coral },
    { valor: perfil?.xp ?? 0, rotulo: 'XP', cor: cores.amarelo },
    { valor: perfil?.temasConcluidos ?? 0, rotulo: 'Temas', cor: cores.verde },
  ];

  const cota = perfil?.cota;

  return (
    <SafeAreaView style={e.tela} edges={['top']}>
      <BarraTopo />
      <ScrollView contentContainerStyle={e.rolagem}>
        <Titulo>Perfil</Titulo>

        <Cartao estilo={e.cabecalho}>
          <View style={e.avatar}>
            <Pessoa tamanho={28} cor="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={e.nome} numberOfLines={1}>
              {email ?? 'Estudante'}
            </Text>
            <Text style={e.detalhe}>Objetivo: {objetivo ?? '—'}</Text>
            <Text style={e.detalhe}>Plano: {perfil?.plano ?? '—'}</Text>
          </View>
        </Cartao>

        <View style={e.numeros}>
          {numeros.map((n) => (
            <View key={n.rotulo} style={e.numero}>
              <Text style={[e.numeroValor, { color: n.cor }]}>{n.valor}</Text>
              <Text style={e.numeroRotulo}>{n.rotulo}</Text>
            </View>
          ))}
        </View>

        <Text style={e.secao}>Sua cota</Text>
        <Cartao>
          {cota?.ilimitada ? (
            <Text style={e.linha}>
              Modo livre: sem limite de geração. A cota entra quando a assinatura entrar.
            </Text>
          ) : (
            <>
              <Text style={e.linha}>
                {cota?.temasRestantes ?? 0} tema(s) restantes neste mês
              </Text>
              <Text style={e.detalhe}>
                {cota?.questoesUsadas ?? 0} questões usadas em {cota?.competencia ?? '—'}
              </Text>
            </>
          )}
          <Text style={[e.detalhe, { marginTop: espaco.sm }]}>
            {materias.length} matéria(s) na sua conta
          </Text>
        </Cartao>

        <Text style={e.secao}>Preferências</Text>
        <Cartao>
          <View style={e.linhaInterruptor}>
            <View style={{ flex: 1 }}>
              <Text style={e.rotuloInterruptor}>Som</Text>
              <Text style={e.detalhe}>
                Acerto, erro e comemoração. Não interrompe a sua música.
              </Text>
            </View>
            <Switch
              value={som}
              onValueChange={(v) => {
                definirSom(v);
                // Toca ao ligar, para você ouvir o que acabou de escolher.
                if (v) retorno.acerto();
              }}
              trackColor={{ true: cores.laranja, false: cores.borda }}
              accessibilityLabel="Ligar ou desligar o som"
            />
          </View>
        </Cartao>

        <Text style={e.secao}>Ofensiva</Text>
        <Botao titulo="Ver minha ofensiva" variante="fantasma" aoTocar={() => router.push('/ofensiva')} />

        <Text style={e.secao}>Conta</Text>
        <Botao
          titulo="Sair desta conta"
          variante="fantasma"
          carregando={saindo}
          aoTocar={confirmarSaida}
        />

        <Text style={e.secao}>Sobre</Text>
        <Cartao>
          <Text style={e.detalhe}>Servidor: {api.base}</Text>
          <Text style={e.detalhe}>Fuso: {sessao?.fuso ?? '—'}</Text>
          <Text style={[e.detalhe, { marginTop: espaco.sm, lineHeight: 18 }]}>
            Suas matérias ficam na conta, não no aparelho: entrando com o mesmo e-mail em outro
            celular, tudo está lá.
          </Text>
        </Cartao>
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { padding: espaco.lg + 2, paddingBottom: espaco.xxl },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espaco.md + 2, marginTop: espaco.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: raio.md,
    backgroundColor: cores.laranja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { fontWeight: '800', fontSize: tamanho.corpo + 1, color: cores.texto },
  detalhe: { color: cores.textoFraco, fontWeight: '700', fontSize: tamanho.pequeno - 0.5, marginTop: 3 },
  numeros: { flexDirection: 'row', gap: espaco.sm + 2, marginTop: espaco.lg },
  numero: {
    flex: 1,
    backgroundColor: cores.card,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingVertical: espaco.md,
    alignItems: 'center',
  },
  numeroValor: { fontWeight: '800', fontSize: tamanho.h2 - 2 },
  numeroRotulo: {
    fontSize: tamanho.mini - 1,
    color: cores.textoFraco,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  secao: { fontSize: tamanho.h3, fontWeight: '800', color: cores.texto, marginTop: espaco.xl, marginBottom: espaco.sm },
  linha: { fontWeight: '800', fontSize: tamanho.pequeno + 1, color: cores.texto, lineHeight: 20 },
  linhaInterruptor: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
  rotuloInterruptor: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.texto },
});
