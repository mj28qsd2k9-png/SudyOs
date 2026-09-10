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
npm run atualizar    # ja tem o clone: puxa, instala se mudou, monta e sobe
npm start            # usar: monta o app e serve tudo em http://localhost:3333
npm run verificar    # so confere o ambiente, nao sobe nada
npm run diagnosticar # montagem do app falhando: junta ambiente + causa real

npm run dev          # desenvolver: API em :3333 (com recarga)
npm run web          # desenvolver: app em :8081 (com recarga)
npm run mobile       # o app no celular (Expo Go, QR)
npm test             # vitest, nenhum teste toca a rede
npm run typecheck
```

`npm start` serve a build estatica do app pela propria API, entao e um endereco
so. Nesse modo o cliente usa caminho relativo — nao ha URL de API para
configurar, e funciona igual em localhost, no IP da rede ou num dominio.

`dev`, `web` e `mobile` ja compilam `@estudaai/shared` antes de subir: o app e a
API importam o `dist`, e esquecer disso da um erro de modulo que nao parece com
"voce esqueceu de compilar".

O `.env` da raiz e lido pelo `--env-file-if-exists` do Node, sem dotenv.

A montagem do app usa `--clear` sempre. O Metro guarda a transformacao pelo
conteudo do arquivo, e o carimbo de versao vem do ambiente — sem limpar, a build
sai com o carimbo da anterior e a tela passa a mentir sobre qual versao esta no
ar. Custa 21s a mais e evita a falha que mais se repetiu aqui: artefato velho
sendo servido enquanto se procura o defeito no codigo novo.

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
