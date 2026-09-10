import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type ColorValue } from 'react-native';
import Svg, { Circle, Path, type SvgProps } from 'react-native-svg';
import { cores } from './tema';

/** Icones portados do prototipo, um para um. */

/** `cor` aceita ColorValue porque as abas entregam a cor ja resolvida pelo tema. */
type Props = { tamanho?: number; cor?: ColorValue } & SvgProps;

const base = (t: number) => ({ width: t, height: t, viewBox: '0 0 24 24' });

export function Chama({ tamanho = 22, cor = cores.laranja, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path
        fill={cor}
        d="M12 2c1 3-1 4-2 6-2 3 0 5 2 5 1 0 2-1 2-3 3 2 3 6 0 8-4 3-10 1-11-4-1-4 2-7 4-9 3-3 4-6 5-3z"
      />
    </Svg>
  );
}

/**
 * A chama da ofensiva, tremeluzindo.
 *
 * Portada do prototipo, que fazia isso em CSS:
 *
 *   @keyframes flick { 0%,100% { scale(1) rotate(-1.5deg) }
 *                      50%     { scale(1.07) rotate(1.5deg) } }
 *   animation: flick 1.5s ease-in-out infinite;
 *   transform-origin: center bottom;
 *
 * O ponto de giro embaixo e o que faz parecer fogo em vez de logo girando: a
 * base fica presa e so a ponta balanca.
 *
 * So nas chamas grandes (ofensiva, fim de trilha, onboarding). A do cabecalho
 * tem 20px e fica na tela o tempo inteiro — ali o tremor vira cocega no olho,
 * e o prototipo tambem nao animava aquela.
 *
 * Quem pediu menos movimento no sistema recebe a chama parada: animacao em
 * laco infinito e exatamente o caso que a preferencia existe para desligar.
 */
export function ChamaViva({ tamanho = 64, cor, ...rest }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [parada, setParada] = useState(false);

  useEffect(() => {
    let vivo = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
      if (vivo) setParada(reduzir);
    });
    const ouvinte = AccessibilityInfo.addEventListener('reduceMotionChanged', setParada);
    return () => {
      vivo = false;
      ouvinte.remove();
    };
  }, []);

  useEffect(() => {
    if (parada) return;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [anim, parada]);

  if (parada) return <Chama tamanho={tamanho} {...(cor ? { cor } : {})} {...rest} />;

  return (
    <Animated.View
      style={{
        transformOrigin: 'center bottom',
        transform: [
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
          {
            rotate: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ['-1.5deg', '1.5deg'],
            }),
          },
        ],
      }}
    >
      <Chama tamanho={tamanho} {...(cor ? { cor } : {})} {...rest} />
    </Animated.View>
  );
}

export function Estrela({ tamanho = 22, cor = cores.amarelo, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path fill={cor} d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
    </Svg>
  );
}

export function Livro({ tamanho = 24, cor = '#fff', ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path
        fill="none"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
        d="M4 5a2 2 0 012-2h8v16H6a2 2 0 00-2 2V5z"
      />
      <Path
        fill="none"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
        d="M14 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"
      />
    </Svg>
  );
}

export function Pdf({ tamanho = 30, cor = cores.laranja, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path
        fill="none"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
        d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
      />
      <Path fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" d="M14 3v5h5" />
    </Svg>
  );
}

export function Estudar({ tamanho = 24, cor = cores.textoFraco, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path
        fill="none"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
        d="M3 5a2 2 0 012-2h6v18H5a2 2 0 00-2 2V5z"
      />
      <Path
        fill="none"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
        d="M11 3h6a2 2 0 012 2v14a2 2 0 01-2 2h-6"
      />
    </Svg>
  );
}

export function Alvo({ tamanho = 24, cor = cores.textoFraco, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Circle cx={12} cy={12} r={8} fill="none" stroke={cor} strokeWidth={2} />
      <Circle cx={12} cy={12} r={4} fill="none" stroke={cor} strokeWidth={2} />
      <Circle cx={12} cy={12} r={1.4} fill={cor} />
    </Svg>
  );
}

export function Pessoa({ tamanho = 24, cor = cores.textoFraco, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Circle cx={12} cy={8} r={4} fill="none" stroke={cor} strokeWidth={2} />
      <Path fill="none" stroke={cor} strokeWidth={2} d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </Svg>
  );
}

export function Notas({ tamanho = 24, cor = cores.textoFraco, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path
        fill="none"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
        d="M4 4h12l4 4v12H4z"
      />
      <Path fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" d="M9 12h6M9 16h4" />
    </Svg>
  );
}

export function Escudo({ tamanho = 24, cor = cores.azul, ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path fill={cor} d="M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5z" />
    </Svg>
  );
}

export function Confere({ tamanho = 22, cor = '#fff', ...rest }: Props) {
  return (
    <Svg {...base(tamanho)} {...rest}>
      <Path
        fill="none"
        stroke={cor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12.5l4.5 4.5L19 7"
      />
    </Svg>
  );
}
