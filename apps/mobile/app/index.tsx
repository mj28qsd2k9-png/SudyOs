import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useEstado } from '../src/dados/estado';
import { cores } from '../src/ui/tema';

/**
 * Porta de entrada.
 *
 * Tres estados, nesta ordem: carregando o que estava guardado, apresentar o
 * produto (onboarding), pedir a conta. O onboarding vem antes do login de
 * proposito — pedir e-mail a alguem que ainda nao sabe o que o app faz e o jeito
 * mais rapido de perder a pessoa.
 */
export default function Entrada() {
  const { pronto, onboardingFeito, autenticado } = useEstado();

  if (!pronto) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo }}>
        <ActivityIndicator color={cores.laranja} size="large" />
      </View>
    );
  }

  if (!onboardingFeito) return <Redirect href="/onboarding" />;
  if (!autenticado) return <Redirect href="/entrar" />;
  return <Redirect href="/(abas)" />;
}
