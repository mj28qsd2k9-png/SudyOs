# Estuda AI

App de estudos gamificado: o aluno sobe o PDF da matéria, a IA **ensina** o
conteúdo e **gera exercícios** para fixar e treinar para a prova. O contexto
completo do produto está em [`docs/HANDOFF.md`](docs/HANDOFF.md).

Este repositório é a virada do protótipo (`prototipo/estuda-ai-app.html`) para
produto: a geração saiu do navegador e passou a rodar no backend, com chave de
API própria.

## O que já roda

**O app**, em React Native + Expo, contra o backend de verdade:

- onboarding, home com as matérias, upload de PDF, tela de geração com
  progresso, matéria com os temas, aula com anotações, os **7 tipos de
  exercício**, conclusão com XP e ofensiva, tela de ofensiva, missões, notas e
  perfil.

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
- **ofensiva server-authoritative**: a data vem do relógio do servidor no fuso
  do aluno, e a correção das respostas também é do servidor;
- **SQLite** (módulo nativo do Node, sem dependência): tudo sobrevive ao
  restart;
- custo de cada geração medido e devolvido (~US$ 0,10 por tema de 20 questões
  com Sonnet 5 — número medido; ver [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)).

O que falta está em [`docs/ROADMAP.md`](docs/ROADMAP.md) — o próximo é
autenticação, para o app deixar de ser por aparelho.

## Rodando

```bash
npm install
cp .env.example .env      # preencha ANTHROPIC_API_KEY
npm run build --workspace @estudaai/shared

npm run dev               # backend em http://localhost:3333
npm run mobile            # app: Expo (a, i ou w para Android, iOS ou web)
```

O `dev` e o `start` leem o `.env` da raiz pelo suporte nativo do Node
(`--env-file-if-exists`), sem dotenv.

Para o app rodar no **celular físico**, troque `extra.apiUrl` em
`apps/mobile/app.json` pelo IP da sua máquina na rede local — `localhost` no
aparelho aponta para o próprio aparelho.

Há também um banco de testes da API em `http://localhost:3333/teste/`: sobe um
PDF e mostra a trilha crua, com as respostas à vista. É ferramenta de
desenvolvimento, não o app.

```bash
npm test           # 105 testes, nenhum toca a rede
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

Todas as rotas identificam o usuário pelo cabeçalho `x-usuario-id` e aceitam
`x-fuso` (IANA, ex.: `America/Sao_Paulo`). **Isso é provisório** — é exatamente
o ponto onde a autenticação entra; veja `apps/api/src/rotas/contexto.ts`.

| Método | Rota | O que faz |
|---|---|---|
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
