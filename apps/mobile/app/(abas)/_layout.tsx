import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alvo, Estudar, Notas, Pessoa } from '../../src/ui/icones';
import { cores } from '../../src/ui/tema';

export default function LayoutAbas() {
  // A barra precisa caber o icone, o rotulo e a area segura do aparelho. Altura
  // fixa cortava o rotulo em tela sem inset (a web, por exemplo).
  const inset = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: cores.laranja,
        tabBarInactiveTintColor: cores.textoFraco,
        tabBarLabelStyle: { fontWeight: '800', fontSize: 11 },
        tabBarStyle: {
          backgroundColor: cores.card,
          borderTopColor: cores.borda,
          borderTopWidth: 1,
          height: 64 + inset.bottom,
          paddingTop: 8,
          paddingBottom: 10 + inset.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Estudar',
          tabBarIcon: ({ color }) => <Estudar cor={color} />,
        }}
      />
      <Tabs.Screen
        name="missoes"
        options={{ title: 'Missões', tabBarIcon: ({ color }) => <Alvo cor={color} /> }}
      />
      <Tabs.Screen
        name="notas"
        options={{ title: 'Notas', tabBarIcon: ({ color }) => <Notas cor={color} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: 'Perfil', tabBarIcon: ({ color }) => <Pessoa cor={color} /> }}
      />
    </Tabs>
  );
}
