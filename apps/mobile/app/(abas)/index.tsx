import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { temaFoiGerado, type Materia } from '@estudaai/shared';
import { useEstado } from '../../src/dados/estado';
import { BarraTopo } from '../../src/ui/barraTopo';
import { Aviso, Cartao, EmCascata, Titulo, Vazio } from '../../src/ui/componentes';
import { Livro } from '../../src/ui/icones';
import { retorno } from '../../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../../src/ui/tema';

export default function Estudar() {
  const { materias, perfil, erroRede, recarregar } = useEstado();
  const [atualizando, setAtualizando] = useState(false);
  const router = useRouter();

  // Volta desta tela depois de estudar: os numeros precisam estar frescos.
  useFocusEffect(
    useCallback(() => {
      void recarregar();
    }, [recarregar]),
  );

  const puxarParaAtualizar = async () => {
    setAtualizando(true);
    await recarregar();
    setAtualizando(false);
  };

  return (
    <SafeAreaView style={e.tela} edges={['top']}>
      <BarraTopo />
      <ScrollView
        contentContainerStyle={e.rolagem}
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={puxarParaAtualizar} tintColor={cores.laranja} />
        }
      >
        <Titulo>Estudar</Titulo>

        <View style={e.saudacao}>
          <View style={e.marca}>
            <Livro tamanho={28} />
          </View>
          <Text style={e.saudacaoTexto}>
            {materias.length === 0
              ? 'Sobe teu primeiro PDF pra começar.'
              : perfil?.ofensiva.diaFeito
                ? 'Ofensiva de hoje garantida. O resto é vantagem.'
                : 'Faz um tema hoje pra manter a ofensiva acesa.'}
          </Text>
        </View>

        {erroRede && <Aviso texto={`${erroRede} Confira se o servidor está no ar.`} />}

        <Text style={e.secao}>Minhas matérias</Text>

        {materias.length === 0 && !erroRede && (
          <Vazio
            titulo="Nenhuma matéria ainda"
            descricao="Suba o PDF da sua apostila ou dos slides. A IA lê, acha os temas e monta a primeira trilha."
          />
        )}

        {materias.map((m, i) => (
          <EmCascata key={m.id} indice={i}>
            <CartaoMateria materia={m} aoTocar={() => router.push(`/materia/${m.id}`)} />
          </EmCascata>
        ))}

        <Cartao
          estilo={e.novaMateria}
          testID="nova-materia"
          rotulo="Nova matéria: subir um PDF"
          aoTocar={() => {
            retorno.toque();
            router.push('/nova-materia');
          }}
        >
          <Text style={e.novaMateriaTexto}>+ Nova matéria (subir PDF)</Text>
        </Cartao>
      </ScrollView>
    </SafeAreaView>
  );
}

function CartaoMateria({ materia, aoTocar }: { materia: Materia; aoTocar: () => void }) {
  const prontos = materia.temas.filter(temaFoiGerado).length;
  const total = materia.temas.length;
  const fracao = total === 0 ? 0 : prontos / total;

  return (
    <Cartao
      estilo={e.cartaoMateria}
      aoTocar={aoTocar}
      testID="cartao-materia"
      rotulo={`Abrir ${materia.nome}, ${prontos} de ${total} temas prontos`}
    >
      <View style={[e.inicial, { backgroundColor: materia.cor }]}>
        <Text style={e.inicialTexto}>{materia.nome.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={e.nomeMateria} numberOfLines={2}>
          {materia.nome}
        </Text>
        <Text style={e.metaMateria}>
          {total} tema{total === 1 ? '' : 's'} · {prontos} pronto{prontos === 1 ? '' : 's'}
        </Text>
        <View style={e.trilho}>
          <View style={[e.preenchimento, { width: `${Math.round(fracao * 100)}%` }]} />
        </View>
      </View>
    </Cartao>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { padding: espaco.lg + 2, paddingBottom: espaco.xxl },
  saudacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md + 2,
    backgroundColor: cores.creme,
    borderRadius: raio.xl - 2,
    padding: espaco.lg,
    marginTop: espaco.md,
  },
  marca: {
    width: 52,
    height: 52,
    borderRadius: raio.md,
    backgroundColor: cores.laranja,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saudacaoTexto: { flex: 1, fontWeight: '800', fontSize: tamanho.pequeno + 1.5, lineHeight: 20, color: cores.texto },
  secao: { fontSize: tamanho.h3, fontWeight: '800', color: cores.texto, marginTop: espaco.xl, marginBottom: espaco.xs },
  cartaoMateria: { flexDirection: 'row', alignItems: 'center', gap: espaco.md + 2, marginTop: espaco.md },
  inicial: { width: 50, height: 50, borderRadius: raio.md, alignItems: 'center', justifyContent: 'center' },
  inicialTexto: { color: '#fff', fontWeight: '800', fontSize: tamanho.h2 },
  nomeMateria: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.texto },
  metaMateria: { color: cores.textoFraco, fontWeight: '700', fontSize: tamanho.pequeno - 0.5, marginTop: 2 },
  trilho: { height: 8, backgroundColor: cores.borda, borderRadius: raio.pilula, overflow: 'hidden', marginTop: espaco.sm },
  preenchimento: { height: '100%', backgroundColor: cores.verde, borderRadius: raio.pilula },
  novaMateria: {
    marginTop: espaco.md,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: cores.laranja,
    backgroundColor: cores.laranjaClaro,
    alignItems: 'center',
  },
  novaMateriaTexto: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.laranja },
});
