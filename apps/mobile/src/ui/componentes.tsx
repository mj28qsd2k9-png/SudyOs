import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { cores, espaco, raio, tamanho } from './tema';

/**
 * Botao no estilo do prototipo: a borda inferior grossa da a sensacao de
 * relevo, e ela some quando o botao e pressionado. E o detalhe que faz o toque
 * parecer fisico em vez de plano.
 */
export function Botao({
  titulo,
  aoTocar,
  variante = 'primario',
  desabilitado,
  carregando,
  estilo,
  testID,
}: {
  titulo: string;
  aoTocar: () => void;
  variante?: 'primario' | 'verde' | 'fantasma';
  desabilitado?: boolean;
  carregando?: boolean;
  estilo?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const inativo = desabilitado || carregando;
  const paleta =
    variante === 'verde'
      ? { fundo: cores.verde, sombra: cores.verdeEscuro, texto: '#fff' }
      : variante === 'fantasma'
        ? { fundo: cores.card, sombra: cores.borda, texto: cores.laranja }
        : { fundo: cores.laranja, sombra: cores.laranjaEscuro, texto: '#fff' };

  return (
    <Pressable
      onPress={aoTocar}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: !!inativo, busy: !!carregando }}
      testID={testID ?? `botao-${titulo.toLowerCase().replace(/\s+/g, '-')}`}
      style={({ pressed }) => [
        e.botao,
        {
          backgroundColor: inativo ? cores.desabilitado : paleta.fundo,
          borderBottomColor: inativo ? cores.desabilitadoEscuro : paleta.sombra,
        },
        variante === 'fantasma' && !inativo && { borderWidth: 2, borderColor: cores.borda },
        // Afunda o botao no toque em vez de so mudar a cor.
        pressed && !inativo && { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
        estilo,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={inativo ? cores.desabilitadoTexto : paleta.texto} />
      ) : (
        <Text
          style={[
            e.botaoTexto,
            { color: inativo ? cores.desabilitadoTexto : paleta.texto },
          ]}
        >
          {titulo.toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
}

export function Cartao({
  children,
  aoTocar,
  estilo,
  rotulo,
  testID,
}: {
  children: React.ReactNode;
  aoTocar?: () => void;
  estilo?: StyleProp<ViewStyle>;
  rotulo?: string;
  testID?: string;
}) {
  if (!aoTocar) return <View style={[e.cartao, estilo]}>{children}</View>;
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      {...(rotulo ? { accessibilityLabel: rotulo } : {})}
      {...(testID ? { testID } : {})}
      style={({ pressed }) => [e.cartao, pressed && { opacity: 0.7 }, estilo]}
    >
      {children}
    </Pressable>
  );
}

export function Titulo({ children, estilo }: { children: React.ReactNode; estilo?: StyleProp<TextStyle> }) {
  return <Text style={[e.titulo, estilo]}>{children}</Text>;
}

export function Subtitulo({ children, estilo }: { children: React.ReactNode; estilo?: StyleProp<TextStyle> }) {
  return <Text style={[e.subtitulo, estilo]}>{children}</Text>;
}

/** Barra de progresso com transicao suave — pular de 20% para 80% desorienta. */
export function Barra({ valor, cor = cores.laranja, altura = 14 }: { valor: number; cor?: string; altura?: number }) {
  const largura = useRef(new Animated.Value(valor)).current;
  useEffect(() => {
    Animated.timing(largura, {
      toValue: Math.max(0, Math.min(1, valor)),
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [valor, largura]);

  return (
    <View style={[e.barra, { height: altura, borderRadius: altura }]}>
      <Animated.View
        style={{
          height: '100%',
          borderRadius: altura,
          backgroundColor: cor,
          width: largura.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/** Numero que sobe em vez de aparecer: a subida e o que da a sensacao de ganho. */
export function NumeroQueSobe({
  ate,
  prefixo = '',
  estilo,
  duracao = 700,
}: {
  ate: number;
  prefixo?: string;
  estilo?: StyleProp<TextStyle>;
  duracao?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [valor, setValor] = React.useState(0);

  useEffect(() => {
    const ouvinte = anim.addListener(({ value }) => setValor(Math.round(value)));
    Animated.timing(anim, { toValue: ate, duration: duracao, useNativeDriver: false }).start();
    return () => anim.removeListener(ouvinte);
  }, [ate, duracao, anim]);

  return <Text style={estilo}>{`${prefixo}${valor}`}</Text>;
}

/** Entrada em cascata: os itens surgem em sequencia, nao todos de uma vez. */
export function EmCascata({
  indice,
  children,
  atrasoBase = 60,
}: {
  indice: number;
  children: React.ReactNode;
  atrasoBase?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      delay: indice * atrasoBase,
      useNativeDriver: true,
    }).start();
  }, [anim, indice, atrasoBase]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Sacode na horizontal — o feedback de erro do prototipo. */
export function Sacudida({ tocar, children }: { tocar: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (tocar === 0) return;
    Animated.sequence([
      Animated.timing(anim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [tocar, anim]);
  return <Animated.View style={{ transform: [{ translateX: anim }] }}>{children}</Animated.View>;
}

/** Pulo curto com mola — o feedback de acerto. */
export function Pulinho({ tocar, children }: { tocar: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (tocar === 0) return;
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.12, duration: 130, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [tocar, anim]);
  return <Animated.View style={{ transform: [{ scale: anim }] }}>{children}</Animated.View>;
}

export function Aviso({ texto, tipo = 'erro' }: { texto: string; tipo?: 'erro' | 'info' }) {
  const cor = tipo === 'erro' ? cores.vermelho : cores.textoFraco;
  const fundo = tipo === 'erro' ? cores.vermelhoFundo : cores.creme;
  return (
    <View style={[e.aviso, { backgroundColor: fundo }]}>
      <Text style={[e.avisoTexto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

export function Vazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <View style={e.vazio}>
      <Text style={e.vazioTitulo}>{titulo}</Text>
      <Text style={e.vazioDescricao}>{descricao}</Text>
    </View>
  );
}

const e = StyleSheet.create({
  botao: {
    width: '100%',
    borderRadius: raio.md + 2,
    paddingVertical: 15,
    paddingHorizontal: espaco.lg,
    borderBottomWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  botaoTexto: { fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  cartao: {
    backgroundColor: cores.card,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.lg,
    padding: espaco.lg,
  },
  titulo: { fontSize: tamanho.h1, fontWeight: '800', color: cores.laranja },
  subtitulo: {
    color: cores.textoFraco,
    fontWeight: '700',
    fontSize: tamanho.pequeno + 0.5,
    marginTop: 3,
    lineHeight: 19,
  },
  barra: { backgroundColor: cores.borda, overflow: 'hidden', width: '100%' },
  aviso: { borderRadius: raio.md, padding: espaco.md + 2, marginTop: espaco.md },
  avisoTexto: { fontWeight: '700', fontSize: tamanho.pequeno + 0.5, lineHeight: 19 },
  vazio: { alignItems: 'center', paddingVertical: espaco.xxl + 20, paddingHorizontal: espaco.xl },
  vazioTitulo: { fontWeight: '800', fontSize: tamanho.corpo + 1, color: cores.texto, textAlign: 'center' },
  vazioDescricao: {
    color: cores.textoFraco,
    fontWeight: '700',
    fontSize: tamanho.pequeno,
    textAlign: 'center',
    marginTop: espaco.sm,
    lineHeight: 19,
  },
});
