import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { tocar } from './som';

/**
 * Retorno ao aluno: som e vibracao juntos.
 *
 * Os dois existem porque nenhum cobre todo mundo — quem estuda no silencioso so
 * sente a vibracao, quem esta com o celular na mesa so ouve o som. E conteudo
 * arido (contabilidade, direito) e justamente onde o retorno imediato segura a
 * pessoa na tela.
 */

function seguro(fn: () => Promise<void>) {
  // Aparelho sem motor de vibracao, ou web: nao pode derrubar a tela.
  if (Platform.OS === 'web') return;
  void fn().catch(() => {});
}

export const retorno = {
  toque: () => {
    tocar('toque');
    seguro(() => Haptics.selectionAsync());
  },
  acerto: () => {
    tocar('acerto');
    seguro(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  erro: () => {
    tocar('erro');
    seguro(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
  conclusao: () => {
    tocar('conclusao');
    seguro(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  conquista: () => {
    tocar('ofensiva');
    seguro(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
};
