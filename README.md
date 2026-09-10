# Estuda AI

App de estudos gamificado: o aluno sobe o PDF da matéria, a IA **ensina** o
conteúdo e **gera exercícios** para fixar e treinar para a prova. O contexto
completo do produto está em [`docs/HANDOFF.md`](docs/HANDOFF.md).

Este repositório é a virada do protótipo (`prototipo/estuda-ai-app.html`) para
produto: a geração saiu do navegador e passou a rodar no backend, com chave de
API própria.

## O que já roda

**O app**, em React Native + Expo, contra o backend de verdade:

- onboarding, **conta (entrar/cadastrar)**, home com as matérias, upload de PDF,
  tela de geração com progresso, matéria com os temas, aula com anotações, os
  **7 tipos de exercício**, conclusão com XP e ofensiva, tela de ofensiva,
  missões, notas e perfil.
- **glossário no toque**: o termo técnico do tema aparece sublinhado na aula,
  no enunciado e na explicação, e um toque mostra o que ele significa. Os termos
  saem na mesma chamada de IA que a aula, então não custam geração nenhuma.
- **som e vibração** no acerto, no erro, na conclusão e quando a ofensiva sobe.
  Os arquivos são sintetizados por `node scripts/gerar-sons.mjs` — nada de
  licença nem de CDN. O som mistura com o que já estiver tocando (não corta a
  sua música) e dá para desligar no Perfil.

**O backend**, em Fastify:

- recebe o **PDF** (multipart), extrai o texto no servidor, mapeia a matéria em
  4–6 temas olhando o documento inteiro e gera a trilha de um tema (aula + 20
  questões);
- as duas famílias de questão do protótipo — prova (padrão ENADE) e fixação
  (estilo Duolingo) — intercaladas;
- geração como **tarefa em segundo plano**: responde na hora e o app acompanha,
  então a conexão pode cair sem perder o trabalho;
- **prompt caching** do material dentro de cada família de chamada;
- **cota do plano** aplicada no servidor (80 questões/mês no plano básico);
- **contas de verdade**: senha com scrypt, sessão por token opaco revogável
  (guardado só como hash), freio de força bruta, e o que o aluno gerou antes de
  se cadastrar vem junto para a conta nova;
- **ofensiva server-authoritative**: a data vem do relógio do servidor no fuso
  do aluno, e a correção das respostas também é do servidor;
- **SQLite** (módulo nativo do Node, sem dependência): tudo sobrevive ao
  restart;
- custo de cada geração medido e devolvido (~US$ 0,10 por tema de 20 questões
  com Sonnet 5 — número medido; ver [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)).

O que falta está em [`docs/ROADMAP.md`](docs/ROADMAP.md) — o próximo é
recuperação de senha e as anotações no servidor.

## Rodando na sua máquina

**Já clonou antes? Um comando só:**

```bash
npm run atualizar
```

Ele puxa o código novo, instala o que mudou de dependência, monta o app e sobe
tudo em `http://localhost:3333`. Existe porque a sequência manual tem quatro
passos em que **esquecer um não dá erro** — dá um app que abre normalmente, com
o código de ontem, e a conclusão natural é "o recurso novo não funciona".

Ele nunca passa por cima do seu trabalho: se houver mudança não salva no clone,
ele para e explica.

**Não sabe se o que está na tela é o atual?** O Perfil mostra a versão em
"Sobre", e o servidor responde a mesma coisa:

```bash
curl -s localhost:3333/saude      # o campo "app" é a build que está no ar
git log -1 --format=%h            # e este é o código que você tem
```


Precisa de **Node 22.5 ou mais novo** (o projeto usa o SQLite embutido do Node).
Confira com `node -v`; se for mais antigo, instale em [nodejs.org](https://nodejs.org).

```bash
git clone -b claude/new-session-0wnc41 https://github.com/mj28qsd2k9-png/SudyOs
cd SudyOs
npm install
cp .env.example .env      # abra o .env e cole sua chave da Anthropic
npm start
```

Abra **http://localhost:3333** — é o app. Um comando, um endereço.

O `npm start` confere o ambiente, monta o app e sobe o backend servindo os dois
no mesmo lugar. Se faltar alguma coisa (Node antigo, chave em branco, porta
ocupada), ele diz o que é e o comando que resolve, em vez de um código de erro.
Para conferir sem subir nada: `npm run verificar`.

> **Um modo de cada vez.** `npm start` e `npm run dev` disputam a porta 3333 e
> não convivem. Antes de trocar de modo, encerre o outro com `Ctrl+C` no
> terminal dele (ou `lsof -ti tcp:3333 | xargs kill`).

### Para desenvolver

`npm start` monta o app uma vez; alterar o código do app exige rodar de novo.
Com recarga automática são dois terminais — e aí **não** se usa o `npm start`:

```bash
npm run dev      # backend  → http://localhost:3333
npm run web      # o app    → http://localhost:8081
```

Nesse modo o app é servido pelo Expo na 8081 e fala com a API na 3333. As duas
portas são diferentes, então esses dois convivem — o que não convive é `npm
start` com qualquer um deles.

### No celular, na mesma Wi-Fi

Preencha `extra.apiUrl` em `apps/mobile/app.json` com o IP da sua máquina
(`http://192.168.x.x:3333`) e rode `npm run mobile` para pegar o QR do Expo Go.
`localhost` no aparelho aponta para o próprio aparelho.

### Quando algo der errado

Se a montagem do app falhar, este comando junta o ambiente e a causa real num
bloco só — o npm imprime o rodapé depois do erro, e quem copia o final do
terminal manda justamente a parte que não explica nada:

```bash
npm run diagnosticar
```


Há um banco de testes da API em `http://localhost:3333/teste/`: cria conta, sobe
um PDF e mostra a trilha crua, com as respostas à vista. **É ferramenta de
diagnóstico, não o app** — serve para inspecionar o que a IA produziu.

O banco de dados fica em `apps/api/dados/estudaai.db` (um arquivo, dá para copiar
como backup) e a causa completa de qualquer falha de geração aparece no log do
terminal.

```bash
npm test           # 147 testes, nenhum toca a rede
npm run typecheck
```

## Estrutura

```
packages/shared/     Contrato de dados (Zod) e regras que backend e app dividem:
                     os 7 tipos de questão, aula, trilha, cota e ofensiva.
apps/api/            Backend Fastify: rotas, camada de IA, PDF, persistência.
apps/mobile/         O app (Expo Router).
docs/                Handoff, arquitetura e roadmap.
prototipo/           O protótipo original, como referência de UX.
```

## API

Toda a API vive sob `/api`. O mesmo servidor serve o app, então sem o prefixo
uma tela nova pode ocupar o endereço de uma rota nova — foi o que aconteceu com
`/perfil`, que era rota da API e tela do app ao mesmo tempo.

Fora de `/saude` e `/api/auth/*`, tudo exige `Authorization: Bearer <token>`. O
cabeçalho `x-fuso` (IANA, ex.: `America/Sao_Paulo`) diz onde o aluno está — quem
decide que dia é hoje continua sendo o servidor.

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/api/auth/cadastrar` | `{ email, senha, aparelho? }` → cria a conta e abre sessão |
| `POST` | `/api/auth/entrar` | `{ email, senha }` → abre sessão |
| `POST` | `/api/auth/sair` | Invalida o token deste aparelho |
| `POST` | `/api/auth/sair-de-todos` | Invalida todas as sessões da conta |
| `GET` | `/api/auth/eu` | Quem é o dono da sessão |
| `GET` | `/saude` | Modelo em uso e se a chave está configurada |
| `GET` | `/api/materias` | Matérias do usuário |
| `GET` | `/api/materias/:id` | Uma matéria com seus temas |
| `POST` | `/api/materias` | PDF em multipart (ou `{ texto }` em JSON) → **202** com `tarefaId` |
| `POST` | `/api/materias/:id/temas/:temaId/gerar` | Gera a trilha de um tema (gasta cota) → **202** |
| `GET` | `/api/tarefas/:id` | Estado da geração: etapa, progresso, resultado ou falha |
| `POST` | `/api/progresso/concluir` | `{ materiaId, temaId, respostas }` → corrige, dá XP e move a ofensiva |
| `GET` | `/api/perfil` | Ofensiva, cota e XP |

A geração é assíncrona: `POST /api/materias` responde **202** com um `tarefaId` e o
cliente acompanha por `GET /api/tarefas/:id`. Se a geração falhar depois de o
mapeamento ter dado certo, a matéria fica salva com os temas por gerar — o aluno
tenta de novo sem subir o PDF outra vez.

Toda falha vem com um `codigo` acionável (`sem_credito`, `chave_invalida`,
`modelo_indisponivel`, `pdf_sem_texto`, …) e um campo dizendo se adianta
repetir.
