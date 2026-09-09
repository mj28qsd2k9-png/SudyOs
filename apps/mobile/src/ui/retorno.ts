import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Retorno tatil.
 *
 * O prototipo tambem sintetizava som com Web Audio. React Native nao tem
 * equivalente: som exigiria arquivos de audio, que ainda nao existem. Vibrar
 * e o que da para entregar hoje com honestidade — e no celular e o retorno que
 * mais se sente. O som entra junto com os assets.
 */

function seguro(fn: () => Promise<void>) {
  // Aparelho sem motor de vibracao, ou web: nao pode derrubar a tela.
  if (Platform.OS === 'web') return;
  void fn().catch(() => {});
}

export const retorno = {
  toque: () => seguro(() => Haptics.selectionAsync()),
  acerto: () => seguro(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  erro: () => seguro(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  conquista: () => seguro(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
};
