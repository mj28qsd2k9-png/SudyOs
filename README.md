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

Precisa de **Node 22.5 ou mais novo** (o projeto usa o SQLite embutido do Node).
Confira com `node -v`; se for mais antigo, instale em [nodejs.org](https://nodejs.org).

```bash
git clone -b claude/new-session-0wnc41 https://github.com/mj28qsd2k9-png/SudyOs
cd SudyOs
npm install
cp .env.example .env      # abra o .env e cole sua chave da Anthropic
```

Antes de subir, confira o ambiente:

```bash
npm run verificar         # diz o que falta e como resolver
```

Depois, **dois terminais**:

```bash
npm run dev               # 1) backend  → http://localhost:3333
npm run web               # 2) o app    → http://localhost:8081
```

Abra `http://localhost:8081`, crie uma conta e suba o PDF da sua apostila. Os
dois comandos compilam o pacote compartilhado sozinhos, e o `dev` roda a
verificação antes de subir — não há passo esquecível no meio.

Para usar pelo celular na mesma Wi-Fi, troque `extra.apiUrl` em
`apps/mobile/app.json` pelo IP da sua máquina (`http://192.168.x.x:3333`) e rode
`npm run mobile` para pegar o QR do Expo Go. `localhost` no aparelho aponta para
o próprio aparelho.

Há também um banco de testes da API em `http://localhost:3333/teste/`: cria
conta, sobe um PDF e mostra a trilha crua, com as respostas à vista. É
ferramenta de desenvolvimento, não o app.

**Onde estão as coisas quando algo dá errado:** o banco em
`apps/api/dados/estudaai.db` (um arquivo, dá para copiar como backup) e a causa
completa de qualquer falha de geração no log do terminal do `npm run dev`.

```bash
npm test           # 143 testes, nenhum toca a rede
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

Fora de `/saude` e `/auth/*`, tudo exige `Authorization: Bearer <token>`. O
cabeçalho `x-fuso` (IANA, ex.: `America/Sao_Paulo`) diz onde o aluno está — quem
decide que dia é hoje continua sendo o servidor.

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/auth/cadastrar` | `{ email, senha, aparelho? }` → cria a conta e abre sessão |
| `POST` | `/auth/entrar` | `{ email, senha }` → abre sessão |
| `POST` | `/auth/sair` | Invalida o token deste aparelho |
| `POST` | `/auth/sair-de-todos` | Invalida todas as sessões da conta |
| `GET` | `/auth/eu` | Quem é o dono da sessão |
| `GET` | `/saude` | Modelo em uso e se a chave está configurada |
| `GET` | `/materias` | Matérias do usuário |
| `GET` | `/materias/:id` | Uma matéria com seus temas |
| `POST` | `/materias` | PDF em multipart (ou `{ texto }` em JSON) → **202** com `tarefaId` |
| `POST` | `/materias/:id/temas/:temaId/gerar` | Gera a trilha de um tema (gasta cota) → **202** |
| `GET` | `/tarefas/:id` | Estado da geração: etapa, progresso, resultado ou falha |
| `POST` | `/progresso/concluir` | `{ materiaId, temaId, respostas }` → corrige, dá XP e move a ofensiva |
| `GET` | `/perfil` | Ofensiva, cota e XP |

A geração é assíncrona: `POST /materias` responde **202** com um `tarefaId` e o
cliente acompanha por `GET /tarefas/:id`. Se a geração falhar depois de o
mapeamento ter dado certo, a matéria fica salva com os temas por gerar — o aluno
tenta de novo sem subir o PDF outra vez.

Toda falha vem com um `codigo` acionável (`sem_credito`, `chave_invalida`,
`modelo_indisponivel`, `pdf_sem_texto`, …) e um campo dizendo se adianta
repetir.
