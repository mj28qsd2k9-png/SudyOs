# Estuda AI

App de estudos gamificado: o aluno sobe o PDF da matéria, a IA **ensina** o
conteúdo e **gera exercícios** para fixar e treinar para a prova. O contexto
completo do produto está em [`docs/HANDOFF.md`](docs/HANDOFF.md).

Este repositório é a virada do protótipo (`prototipo/estuda-ai-app.html`) para
produto: a geração saiu do navegador e passou a rodar no backend, com chave de
API própria.

## O que já roda

O **backend de geração**, completo e testado:

- recebe o texto de um PDF, mapeia a matéria em 4–6 temas olhando o documento
  inteiro, e gera a trilha de um tema (aula + 20 questões);
- as duas famílias de questão do protótipo — prova (padrão ENADE) e fixação
  (estilo Duolingo) — intercaladas, nos 7 tipos;
- **prompt caching** do material entre as chamadas de um mesmo tema;
- **cota do plano** aplicada no servidor (80 questões/mês no plano básico);
- **ofensiva server-authoritative**: a data vem do relógio do servidor no fuso
  do aluno, e a correção das respostas também é do servidor;
- custo de cada geração medido e devolvido na resposta (~US$ 0,10 por tema de
  20 questões com Sonnet 5 — número medido, não estimado; ver
  [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)).

O que ainda não existe está em [`docs/ROADMAP.md`](docs/ROADMAP.md) — o próximo
passo é o app em React Native + Expo.

## Rodando

```bash
npm install
cp .env.example .env      # preencha ANTHROPIC_API_KEY
npm run build --workspace @estudaai/shared
npm run dev               # sobe a API em http://localhost:3333
```

Abra `http://localhost:3333/teste/` para o **banco de testes**: uma página que
extrai o texto de um PDF no navegador (pdf.js) e exercita a API de ponta a
ponta. É ferramenta de desenvolvimento, não o app.

```bash
npm test           # 76 testes, nenhum toca a rede
npm run typecheck
```

O `npm run dev` e o `npm start` leem o `.env` da raiz pelo suporte nativo do
Node (`--env-file-if-exists`), sem dependência de dotenv.

## Estrutura

```
packages/shared/     Contrato de dados (Zod) e regras que backend e app dividem:
                     os 7 tipos de questão, aula, trilha, cota e ofensiva.
apps/api/            Backend Fastify: rotas, camada de IA, material, persistência.
apps/api/public/     Banco de testes da API (página de desenvolvimento).
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
| `POST` | `/materias` | `{ texto }` → mapeia os temas e gera o primeiro |
| `POST` | `/materias/:id/temas/:temaId/gerar` | Gera a trilha de um tema (gasta cota) |
| `POST` | `/progresso/concluir` | `{ materiaId, temaId, respostas }` → corrige, dá XP e move a ofensiva |
| `GET` | `/perfil` | Ofensiva, cota e XP |

`POST /materias` responde **201** quando o primeiro tema saiu e **207** quando o
mapeamento funcionou mas a geração falhou — nesse caso a matéria fica salva e o
aluno tenta de novo sem subir o PDF outra vez.
