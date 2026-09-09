import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstado } from '../src/dados/estado';
import { api, ErroApi } from '../src/api/cliente';
import { Aviso, Botao, Subtitulo, Titulo } from '../src/ui/componentes';
import { Pdf } from '../src/ui/icones';
import { voltar } from '../src/ui/navegar';
import { retorno } from '../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../src/ui/tema';

export default function NovaMateria() {
  const { sessao, perfil } = useEstado();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  const semCota = perfil?.cota && !perfil.cota.ilimitada && (perfil.cota.temasRestantes ?? 0) < 1;

  const escolher = async () => {
    retorno.toque();
    setErro(null);

    const escolha = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (escolha.canceled || !escolha.assets?.[0]) return;

    const arquivo = escolha.assets[0];
    setEnviando(true);
    try {
      const { tarefaId } = await api.enviarPdf(sessao, {
        uri: arquivo.uri,
        nome: arquivo.name,
        tipo: arquivo.mimeType ?? 'application/pdf',
      });
      // Substitui em vez de empilhar: voltar para cá com o PDF já enviado
      // convidaria a mandar o mesmo arquivo duas vezes.
      router.replace({ pathname: '/gerando', params: { tarefaId } });
    } catch (e) {
      setErro(
        e instanceof ErroApi
          ? e.message
          : 'Não consegui falar com o servidor. Confira a conexão e se a API está no ar.',
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SafeAreaView style={e.tela} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={e.rolagem}>
        <Pressable
          onPress={() => voltar('/(abas)')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={e.voltar}>← Voltar</Text>
        </Pressable>

        <Titulo>Nova matéria</Titulo>
        <Subtitulo>
          A IA lê o PDF, acha os temas e monta a trilha do primeiro. Cada tema gerado usa 20 da sua
          cota.
        </Subtitulo>

        <Pressable
          onPress={escolher}
          disabled={enviando || semCota}
          style={({ pressed }) => [e.area, pressed && { opacity: 0.75 }, semCota && { opacity: 0.5 }]}
        >
          <View style={e.iconeArea}>
            <Pdf tamanho={30} />
          </View>
          <Text style={e.areaTitulo}>{enviando ? 'Enviando…' : 'Escolher PDF'}</Text>
          <Text style={e.areaDescricao}>
            Apostila, slides ou resumo — com texto de verdade, não página escaneada.
          </Text>
        </Pressable>

        {semCota && (
          <Aviso texto="Sua cota do mês acabou. Ela renova na virada do mês." />
        )}
        {erro && <Aviso texto={erro} />}

        <View style={e.nota}>
          <Text style={e.notaTexto}>
            O arquivo vai para o servidor, que extrai o texto e chama a IA. Você pode fechar o app
            durante a geração: ela continua, e o resultado estará aqui quando voltar.
          </Text>
        </View>

        <Botao
          titulo="Cancelar"
          variante="fantasma"
          aoTocar={() => voltar('/(abas)')}
          estilo={{ marginTop: espaco.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { padding: espaco.lg + 2, paddingBottom: espaco.xxl },
  voltar: { color: cores.textoFraco, fontWeight: '800', fontSize: tamanho.pequeno + 1, marginBottom: espaco.sm },
  area: {
    marginTop: espaco.xl,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: cores.laranja,
    borderRadius: raio.xl,
    backgroundColor: cores.laranjaClaro,
    paddingVertical: espaco.xxl + 6,
    paddingHorizontal: espaco.xl,
    alignItems: 'center',
  },
  iconeArea: {
    width: 56,
    height: 56,
    borderRadius: raio.md + 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.md,
  },
  areaTitulo: { fontWeight: '800', fontSize: tamanho.h3 - 2, color: cores.texto },
  areaDescricao: {
    color: cores.textoFraco,
    fontWeight: '700',
    fontSize: tamanho.pequeno - 0.5,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  nota: { backgroundColor: cores.creme, borderRadius: raio.md, padding: espaco.md + 2, marginTop: espaco.lg },
  notaTexto: { fontWeight: '700', fontSize: tamanho.mini + 1, color: cores.textoFraco, lineHeight: 18 },
});
