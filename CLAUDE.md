# Estuda AI — notas para o Claude Code

## Contexto

App de estudos gamificado. Leia `docs/HANDOFF.md` primeiro: é a fonte da verdade
do produto e traz as decisões já fechadas (não reabrir sem motivo). O **porquê**
das escolhas técnicas está em `docs/ARQUITETURA.md`; o que falta, em
`docs/ROADMAP.md`.

O protótipo original está em `prototipo/estuda-ai-app.html`, como referência de
UX e de lógica. Ele não é código de produção.

## Comandos

```bash
npm install
npm run build --workspace @estudaai/shared   # o app/api importam o dist
npm run dev          # API em http://localhost:3333, banco de testes em /teste/
npm test             # vitest, nenhum teste toca a rede
npm run typecheck
```

## Convenções

- **Português no código.** Nomes de arquivo, funções, variáveis e comentários
  seguem o domínio (`materia`, `tema`, `ofensiva`, `cota`). Sem acento em
  identificadores; com acento no texto que o usuário lê.
- **Regra pura vai para `packages/shared`.** Nada que precise de rede entra lá —
  é o que permite o app rodar a mesma correção e a mesma lógica de ofensiva.
- **O servidor decide.** Cota, correção de resposta e data da ofensiva não são
  informadas pelo cliente. Se uma rota nova aceitar um desses do cliente, está
  errada.
- **Prompt caching é frágil por desenho.** Ver `apps/api/src/ia/prompts.ts`:
  nada que varie por chamada pode entrar no preâmbulo ou no bloco do material.
  Mudar isso sem querer não quebra teste nenhum — só triplica a conta.
- **Teste não chama a API da Anthropic.** Use `test/apoio/geradorFalso.ts` para
  rotas e mocks do cliente para `src/ia/cliente.ts`.

## Modelo de IA

`claude-sonnet-5` é o padrão, por decisão do handoff, e é configurável por
`MODELO_IA`. Ao mexer na camada `src/ia/`, confira a referência da API atual
antes — ids de modelo e parâmetros mudaram bastante (`budget_tokens` saiu,
`output_config.effort` entrou, prefill de assistente foi removido).
