import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useEstado } from '../src/dados/estado';
import { cores } from '../src/ui/tema';

/** Porta de entrada: decide entre onboarding e o app, sem piscar nenhum dos dois. */
export default function Entrada() {
  const { pronto, onboardingFeito } = useEstado();

  if (!pronto) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo }}>
        <ActivityIndicator color={cores.laranja} size="large" />
      </View>
    );
  }

  return <Redirect href={onboardingFeito ? '/(abas)' : '/onboarding'} />;
}
