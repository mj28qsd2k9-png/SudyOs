# Estuda AI — Documento de passagem (handoff para o Claude Code)

> Leia este arquivo primeiro. Ele tem todo o contexto do projeto pra continuar o desenvolvimento do zero de um produto real, a partir do protótipo `estuda-ai-app.html`.

---

## 0. Estado atual (atualizado em 2026-09-08)

> Este documento continua sendo a fonte da verdade do **produto**. O que já foi
> construído a partir dele:
>
> - **Backend de geração pronto** (`apps/api`): recebe o texto do PDF, mapeia os
>   temas e gera aula + 20 questões por tema chamando a API da Anthropic com
>   chave própria, com prompt caching e cota aplicada no servidor.
> - **Ofensiva server-authoritative pronta** (`packages/shared/src/ofensiva.ts`).
> - **Contrato de dados das questões portado** para Zod, compartilhado entre
>   backend e app (`packages/shared`).
>
> O **porquê** das escolhas está em [`ARQUITETURA.md`](ARQUITETURA.md); o que
> falta e em que ordem, em [`ROADMAP.md`](ROADMAP.md). O item 4 da seção "O que
> falta construir" abaixo já está resolvido (extração no cliente com pdf.js).

---

## 1. O que é o produto

**Estuda AI** (nome de trabalho — a definir) é um app de estudos gamificado, no estilo Duolingo. O usuário sobe um **PDF da matéria da faculdade**, a IA lê, **ensina o conteúdo** (aula) e **gera exercícios** variados pra fixar e treinar pra prova. O objetivo: transformar estudar num hábito diário, sem a pessoa precisar ler o PDF maçante.

É um **produto à parte** de outro app da mesma casa (o "Invest AI", de educação financeira). Compartilham a mesma paleta/identidade visual, mas são produtos separados.

Público: estudantes (faculdade/concurso/escola). Dor central: baixar o material e não estudar. Diferencial vs. Quizlet/StudyFetch: qualidade das questões + experiência gamificada (ofensiva) + ensinar antes de cobrar.

---

## 2. Decisões já fechadas (não reabrir sem motivo)

- **Unidade de geração = TEMA** (uma matéria tem ~5 temas). Cada tema vira uma trilha.
- **Tema padrão = 20 questões.**
- **Plano básico = 80 questões/mês** (cota que o usuário distribui entre temas como quiser). No protótipo a cota está desligada ("modo livre") porque o dono é o usuário zero.
- **Modelo de IA padrão = Claude Sonnet 5** (equilíbrio qualidade/custo). Haiku 4.5 como opção mais barata. Custo por tema ~US$0,03 (Sonnet 5). Preços API ago/2026 (in/out por milhão de tokens): Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25; cache read = 10% do input; Batch = -50%.
- **7 tipos de questão**: `mc` (múltipla escolha), `tf` (verdadeiro/falso), `fill` (completar frase), `match` (ligar pares), `cenario` (estudo de caso), `calc` (calcular), `ordenar` (colocar em ordem).
- **Pedagogia**: ensinar primeiro, testar depois. Cada tema abre com uma AULA (blocos didáticos + resumo) e só então os exercícios.
- **Estilo das questões de prova**: padrão ENADE/Estácio (texto-base contextualizado + comando + 5 alternativas plausíveis, sem pegadinha, sem termos absolutos). Mais os exercícios de fixação estilo Duolingo, intercalados.
- **Ofensiva separada da meta diária**: 1 tema por dia mantém a ofensiva; a meta diária (leve/normal/puxado) é engajamento extra. (Essa é a sacada do Duolingo que aumenta retenção.)

---

## 3. O que JÁ existe no protótipo (`estuda-ai-app.html`)

Tudo em um HTML só, front-end, estado em memória (zera ao fechar). Serve de referência de UX e de lógica.

- **Onboarding**: boas-vindas, "o que quer estudar?", compromisso de hábito.
- **Home (Estudar)**: lista de matérias; matéria de exemplo (Biologia Celular) pré-carregada e jogável offline; botão "+ Nova matéria (subir PDF)".
- **Fluxo do tema**: Aula (blocos + resumo, com marca-texto e notas) → Exercícios (os 7 tipos) → tela de conclusão.
- **Geração por IA (PDF → trilha)**: extrai texto do PDF (pdf.js), "destrincha" em blocos, mapeia temas olhando o doc inteiro, e gera cada tema puxando o trecho relevante. Duas famílias de questão por tema (prova ENADE + fixação Duolingo), intercaladas. Parser robusto (aproveita questões completas mesmo com resposta cortada; normaliza campos).
- **Marca-texto + aba Notas**: grifar trechos e criar notas na aula; aba "Notas" agrupa tudo por matéria e tema.
- **Sistema de ofensiva**: contador no topo; tela de Ofensiva (calendário da semana, meta diária com anel, congelamentos até 2, próximo marco); comemoração em tela cheia quando o número sobe (só na 1ª conclusão do dia).
- **Movimento/áudio**: som sintetizado (acerto/erro/conclusão), confete, física de mola, transições, entrada em cascata das alternativas, contadores animados, chama tremeluzente.

**Esquema da questão (contrato de dados)** — usar o mesmo no backend:
```
mc/calc/cenario: { tipo, pergunta, opcoes:[...], correta:<índice>, explicacao, (contexto p/ cenario) }
tf:   { tipo, pergunta, resposta:<bool>, explicacao }
fill: { tipo, antes, depois, opcoes:[...], correta:<índice>, explicacao }
match:{ tipo, pares:[[termo,def],...], explicacao }
ordenar:{ tipo, instrucao, ordem_correta:[...], explicacao }
```
A aula: `{ blocos:[{titulo,texto}], resumo:[...] }`.

**Prompts de geração** (outline de temas, questões estilo prova, questões de fixação, aula) estão prontos dentro do HTML — copiar e reusar no backend.

---

## 4. A grande virada necessária: sair do protótipo

O protótipo usa a **IA dentro do ambiente do Claude** (a ponte de artefato). Isso NÃO funciona fora dele. Pra virar produto, a geração tem que rodar no **backend com chave de API própria**. Praticamente tudo que falta gira em torno disso.

### O que falta construir
1. **Backend** (guarda a chave da Anthropic; chama a API server-side; aplica a cota do plano; usa prompt caching pra baratear).
2. **Autenticação / contas de usuário.**
3. **Banco de dados**: usuários, matérias, temas, questões, progresso, **ofensiva (data da última conclusão no fuso do usuário, validada no servidor — server-authoritative, pra ninguém burlar mudando o relógio)**, anotações, cota usada no mês.
4. **Processamento de PDF** (extrair texto — pode ser no cliente com pdf.js e enviar texto, ou no servidor).
5. **Notificações push** (lembrete de ofensiva) — o ingrediente que traz a pessoa de volta. Precisa de app nativo (ou web push).
6. **Revisão espaçada** (ainda não construída): guardar erros por conceito/tag e ressurgir com o tempo.
7. **Assinatura/pagamento** (quando for cobrar): reativar a cota + gateway.
8. **Animação de personagem** (opcional/futuro): assets Rive (`.riv`) ou Lottie (`.json`) — não sai por código, precisa de animador.

### Stack sugerida (a validar no Claude Code)
- **Mobile**: React Native + Expo (pra ter push notification e loja de apps) — ou PWA se quiser começar no navegador.
- **Backend + dados + auth**: Supabase (Postgres + Auth + Edge Functions) é um bom atalho; ou Node (Fastify/Express) + Postgres.
- **IA**: SDK oficial da Anthropic no backend, Sonnet 5 padrão, com prompt caching do material.
- Portar do protótipo: prompts, esquema de questão, lógica de ofensiva, UX das telas.

---

## 5. Sugestão de primeiro passo no Claude Code

Abra o Claude Code, coloque este arquivo e o `estuda-ai-app.html` na pasta do projeto, e comece com algo como:

> "Este é o handoff e o protótipo de um app de estudos (Estuda AI). Leia os dois. Quero transformar em um app real. Comece pela arquitetura: me proponha a estrutura de pastas e a stack (mobile + backend + banco), scaffolde o projeto, e monte primeiro o backend que recebe um texto de PDF e gera uma trilha de tema (aula + 20 questões) chamando a API da Anthropic com minha chave, aplicando o esquema de questões do protótipo."

Depois, na ordem: backend de geração → auth + banco → ofensiva server-authoritative → anotações → revisão espaçada → notificações → assinatura.

---

## 6. Observação sobre a memória entre ferramentas

O contexto do projeto pode estar salvo na memória do Claude entre superfícies, mas não conte com isso: **este documento é a fonte da verdade** do handoff. Mantenha-o atualizado conforme o app evoluir.
