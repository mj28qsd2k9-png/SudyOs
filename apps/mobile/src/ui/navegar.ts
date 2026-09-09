import { router } from 'expo-router';
import type { Href } from 'expo-router';

/**
 * Voltar com destino garantido.
 *
 * `router.back()` sozinho falha quando nao ha historico — o navegador reclama
 * "GO_BACK was not handled by any navigator" e o toque nao faz nada. Isso
 * acontece sempre que a tela e aberta direto: link compartilhado, notificacao
 * push (que e o proximo item do roadmap) ou recarregar a pagina na web.
 *
 * Botao de voltar que nao volta e pior do que nao ter botao: prende o aluno.
 */
export function voltar(destino: Href): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(destino);
}
