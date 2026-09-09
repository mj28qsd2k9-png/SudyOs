import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Guarda do token de sessao.
 *
 * Token e credencial: no celular vai para o Keychain (iOS) ou o Keystore
 * (Android) via SecureStore, nao para o AsyncStorage, que e texto puro no
 * sistema de arquivos do app.
 *
 * Na web o SecureStore nao existe. Ali o token cai no armazenamento comum, que
 * e o que qualquer app web faz — e por isso a web e ambiente de
 * desenvolvimento aqui, nao a plataforma de producao.
 */

const CHAVE_TOKEN = 'estudaai.token';

const naWeb = Platform.OS === 'web';

export async function guardarToken(token: string): Promise<void> {
  try {
    if (naWeb) await AsyncStorage.setItem(CHAVE_TOKEN, token);
    else await SecureStore.setItemAsync(CHAVE_TOKEN, token);
  } catch {
    // Cofre indisponivel nao pode impedir o login desta sessao; o aluno so vai
    // precisar entrar de novo na proxima abertura.
  }
}

export async function lerToken(): Promise<string | null> {
  try {
    return naWeb
      ? await AsyncStorage.getItem(CHAVE_TOKEN)
      : await SecureStore.getItemAsync(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export async function apagarToken(): Promise<void> {
  try {
    if (naWeb) await AsyncStorage.removeItem(CHAVE_TOKEN);
    else await SecureStore.deleteItemAsync(CHAVE_TOKEN);
  } catch {
    // Idem: se nao deu para apagar, o servidor ja invalidou a sessao.
  }
}
