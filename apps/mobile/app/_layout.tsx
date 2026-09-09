import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProvedorEstado } from '../src/dados/estado';
import { cores } from '../src/ui/tema';

export default function LayoutRaiz() {
  return (
    <SafeAreaProvider>
      <ProvedorEstado>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: cores.fundo },
            animation: 'slide_from_right',
          }}
        >
          {/* A trilha e a comemoracao entram de baixo: sao momentos, nao lugares. */}
          <Stack.Screen name="trilha/[materiaId]/[temaId]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="gerando" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack>
      </ProvedorEstado>
    </SafeAreaProvider>
  );
}
