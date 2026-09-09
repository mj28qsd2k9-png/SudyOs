import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { cores } from './tema';

/**
 * Confete.
 *
 * O prototipo desenhava num canvas com fisica propria. Aqui cada papelzinho e
 * uma View animada: sobe, cai com aceleracao, gira e desaparece. Sem canvas e
 * sem biblioteca — o efeito e o mesmo e o custo e um `useNativeDriver`.
 */

const PALETA = [cores.laranja, cores.verde, cores.amarelo, cores.coral, cores.azul];

type Papel = { esquerda: number; atraso: number; cor: string; tamanho: number; giro: number };

export function Confete({ tocar, quantidade = 60 }: { tocar: number; quantidade?: number }) {
  const { width, height } = Dimensions.get('window');

  const papeis = useMemo<Papel[]>(
    () =>
      Array.from({ length: quantidade }, (_, i) => ({
        esquerda: width / 2 + (Math.random() - 0.5) * width * 0.7,
        atraso: Math.random() * 220,
        cor: PALETA[i % PALETA.length]!,
        tamanho: 6 + Math.random() * 7,
        giro: (Math.random() - 0.5) * 720,
      })),
    [quantidade, width],
  );

  if (tocar === 0) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {papeis.map((p, i) => (
        <Papelzinho key={`${tocar}-${i}`} papel={p} altura={height} />
      ))}
    </View>
  );
}

function Papelzinho({ papel, altura }: { papel: Papel; altura: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 1800,
      delay: papel.atraso,
      // Sobe rapido e cai devagarinho, como algo jogado para cima.
      easing: Easing.bezier(0.15, 0.6, 0.5, 1),
      useNativeDriver: true,
    }).start();
  }, [anim, papel.atraso]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: papel.esquerda,
        top: altura * 0.34,
        width: papel.tamanho,
        height: papel.tamanho * 0.6,
        backgroundColor: papel.cor,
        opacity: anim.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [0, -altura * 0.22, altura * 0.75],
            }),
          },
          {
            translateX: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, (papel.giro / 720) * 120],
            }),
          },
          {
            rotate: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${papel.giro}deg`],
            }),
          },
        ],
      }}
    />
  );
}
