import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProvedorEstado, useEstado } from '../src/dados/estado';
import { cores } from '../src/ui/tema';

/** Rotas que existem antes de haver conta. */
const PUBLICAS = new Set(['', 'onboarding', 'entrar']);

export default function LayoutRaiz() {
  return (
    <SafeAreaProvider>
      <ProvedorEstado>
        <StatusBar style="dark" />
        <Guarda />
      </ProvedorEstado>
    </SafeAreaProvider>
  );
}

/**
 * Guarda de sessao, na raiz.
 *
 * Fica aqui, e nao em cada tela, porque tela protegida sem guarda so aparece
 * quando alguem abre a URL direto ou a sessao cai no meio do uso — os dois
 * casos que ninguem testa a mao. Na raiz, uma rota nova nasce protegida.
 */
function Guarda() {
  const { pronto, autenticado } = useEstado();
  const segmentos = useSegments();
  const primeiro = segmentos[0] ?? '';

  if (!pronto) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo }}>
        <ActivityIndicator color={cores.laranja} size="large" />
      </View>
    );
  }

  // `index` decide sozinho entre onboarding, login e app; nao pode ser desviada
  // aqui, senao o onboarding nunca apareceria para quem ainda nao tem conta.
  if (!autenticado && !PUBLICAS.has(primeiro)) {
    return <Redirect href="/entrar" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: cores.fundo },
        animation: 'slide_from_right',
      }}
    >
      {/* A trilha entra de baixo: e um momento, nao um lugar. */}
      <Stack.Screen name="trilha/[materiaId]/[temaId]" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="gerando" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="entrar" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
