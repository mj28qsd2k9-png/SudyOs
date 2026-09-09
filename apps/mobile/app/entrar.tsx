import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEstado } from '../src/dados/estado';
import { ErroApi } from '../src/api/cliente';
import { Aviso, Botao } from '../src/ui/componentes';
import { Livro } from '../src/ui/icones';
import { retorno } from '../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../src/ui/tema';

const MINIMO_SENHA = 8;

/**
 * Entrar ou criar conta.
 *
 * As duas coisas moram na mesma tela porque sao a mesma intencao — "quero
 * comecar a usar" — e obrigar o aluno a adivinhar em qual das duas telas ele
 * esta e atrito puro logo na porta de entrada.
 */
export default function Entrar() {
  const [modo, setModo] = useState<'entrar' | 'cadastrar'>('cadastrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const { entrar, cadastrar } = useEstado();
  const router = useRouter();

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const podeEnviar = emailValido && senha.length >= (modo === 'cadastrar' ? MINIMO_SENHA : 1);

  const enviar = async () => {
    if (!podeEnviar || ocupado) return;
    retorno.toque();
    setOcupado(true);
    setErro(null);
    try {
      const credenciais = { email: email.trim(), senha };
      if (modo === 'entrar') {
        await entrar(credenciais);
      } else {
        const { materiasTrazidas } = await cadastrar(credenciais);
        if (materiasTrazidas > 0) {
          // Aviso curto: o aluno precisa saber que o que ele gerou nao sumiu.
          setErro(null);
        }
      }
      retorno.acerto();
      router.replace('/(abas)');
    } catch (e) {
      retorno.erro();
      // Quem tentou criar conta com um e-mail que ja existe quase sempre e a
      // propria pessoa, voltando. Mudar o modo por ela poupa um toque; a senha
      // sai do campo porque a que ela digitou era para uma conta NOVA — tentar
      // entrar com ela sozinho seria adivinhar.
      if (e instanceof ErroApi && e.codigo === 'email_em_uso') {
        setModo('entrar');
        setSenha('');
        setErro('Você já tem conta com esse e-mail. Digite a sua senha para entrar.');
      } else {
        setErro(mensagem(e, modo));
      }
    } finally {
      setOcupado(false);
    }
  };

  return (
    <SafeAreaView style={e.tela} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={e.rolagem} keyboardShouldPersistTaps="handled">
          <View style={e.topo}>
            <View style={e.marca}>
              <Livro tamanho={44} />
            </View>
            <Text style={e.titulo}>
              {modo === 'cadastrar' ? 'Criar sua conta' : 'Entrar'}
            </Text>
            <Text style={e.subtitulo}>
              {modo === 'cadastrar'
                ? 'Suas matérias e sua ofensiva ficam na conta — não no aparelho.'
                : 'Bom te ver de volta.'}
            </Text>
          </View>

          <View style={{ gap: espaco.md }}>
            <View>
              <Text style={e.rotulo}>E-mail</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="voce@email.com"
                placeholderTextColor={cores.textoFraco}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                testID="campo-email"
                style={e.campo}
              />
            </View>

            <View>
              <Text style={e.rotulo}>Senha</Text>
              <View>
                <TextInput
                  value={senha}
                  onChangeText={setSenha}
                  placeholder={`Pelo menos ${MINIMO_SENHA} caracteres`}
                  placeholderTextColor={cores.textoFraco}
                  secureTextEntry={!mostrarSenha}
                  autoCapitalize="none"
                  autoComplete={modo === 'cadastrar' ? 'new-password' : 'current-password'}
                  onSubmitEditing={() => void enviar()}
                  returnKeyType="go"
                  testID="campo-senha"
                  style={[e.campo, { paddingRight: 74 }]}
                />
                <Pressable
                  onPress={() => setMostrarSenha((v) => !v)}
                  style={e.olho}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={mostrarSenha ? 'Esconder a senha' : 'Mostrar a senha'}
                >
                  <Text style={e.olhoTexto}>{mostrarSenha ? 'Ocultar' : 'Mostrar'}</Text>
                </Pressable>
              </View>
            </View>

            {erro && <Aviso texto={erro} />}

            <Botao
              titulo={modo === 'cadastrar' ? 'Criar conta' : 'Entrar'}
              aoTocar={() => void enviar()}
              desabilitado={!podeEnviar}
              carregando={ocupado}
              testID="botao-enviar"
            />

            <Pressable
              onPress={() => {
                retorno.toque();
                setModo(modo === 'cadastrar' ? 'entrar' : 'cadastrar');
                setErro(null);
              }}
              hitSlop={10}
              accessibilityRole="button"
              testID="trocar-modo"
            >
              <Text style={e.trocar}>
                {modo === 'cadastrar'
                  ? 'Já tenho conta — entrar'
                  : 'Ainda não tenho conta — criar'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function mensagem(erro: unknown, modo: 'entrar' | 'cadastrar'): string {
  if (erro instanceof ErroApi) {
    switch (erro.codigo) {
      case 'credenciais_invalidas':
        return 'E-mail ou senha não conferem.';
      case 'muitas_tentativas':
        return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
      case 'dados_invalidos':
        return modo === 'cadastrar'
          ? `Confira o e-mail e use uma senha de pelo menos ${MINIMO_SENHA} caracteres.`
          : 'Confira o e-mail e a senha.';
      default:
        return erro.message;
    }
  }
  return 'Não consegui falar com o servidor. Confira a conexão.';
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  rolagem: { flexGrow: 1, justifyContent: 'center', padding: espaco.xl },
  topo: { alignItems: 'center', marginBottom: espaco.xxl },
  marca: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: cores.laranja,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.lg,
  },
  titulo: { fontSize: 28, fontWeight: '800', color: cores.texto, textAlign: 'center' },
  subtitulo: {
    color: cores.textoFraco,
    fontWeight: '700',
    fontSize: tamanho.pequeno + 1,
    marginTop: espaco.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  rotulo: {
    fontWeight: '800',
    fontSize: tamanho.mini + 1,
    color: cores.textoFraco,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  campo: {
    borderWidth: 2,
    borderColor: cores.borda,
    borderRadius: raio.md,
    backgroundColor: cores.card,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md + 2,
    fontSize: tamanho.corpo,
    fontWeight: '700',
    color: cores.texto,
    minHeight: 52,
  },
  olho: { position: 'absolute', right: espaco.md, top: 0, bottom: 0, justifyContent: 'center' },
  olhoTexto: { fontWeight: '800', fontSize: tamanho.mini + 1, color: cores.laranja },
  trocar: {
    textAlign: 'center',
    color: cores.laranja,
    fontWeight: '800',
    fontSize: tamanho.pequeno + 1,
    paddingVertical: espaco.sm,
  },
});
