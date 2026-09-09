# Arquitetura

Este documento explica **por que** o código está do jeito que está. As decisões
de produto já fechadas estão no [handoff](HANDOFF.md) e não são reabertas aqui.

## A virada que motivou tudo

O protótipo chamava a IA de dentro do ambiente do Claude. Isso não existe fora
dele. Praticamente todo o resto — backend, contas, banco, cota, assinatura —
gira em torno de mover a geração para um servidor com chave própria.

Então a primeira coisa construída foi exatamente isso, e o desenho seguiu uma
regra: **o cliente pede, o servidor decide.** Ele guarda a chave, aplica a cota,
corrige as respostas e diz que dia é hoje. O app fica com a experiência.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Backend | Node + TypeScript + Fastify | Uma linguagem só entre backend e app; Fastify é rápido e enxuto |
| IA | SDK oficial da Anthropic, Sonnet 5 | Decisão do handoff; o modelo é configurável por variável de ambiente |
| Contrato | Zod, em pacote compartilhado | O mesmo esquema valida a saída da IA, o corpo das rotas e os dados no app |
| Persistência | Interface + implementação em memória | A geração precisava rodar antes do banco; a interface é a costura para o Postgres |
| App | React Native + Expo (a construir) | É o caminho para push notification e lojas |

### Monorepo

```
packages/shared     Contrato de dados e regras puras (questões, aula, trilha,
                    cota, ofensiva). Sem I/O, sem dependência de servidor —
                    o app importa exatamente o mesmo código.
apps/api            Backend.
  src/ia/           Tudo que fala com a Anthropic.
  src/material/     Texto do PDF: fatiar, amostrar, achar o trecho do tema.
  src/rotas/        HTTP.
  src/infra/        Persistência.
```

A regra do `shared` é o que dá valor a ele: **nada que precise de rede entra
lá.** Corrigir uma questão e decidir se a ofensiva subiu são regras, não
chamadas — e por serem regras podem rodar nos dois lados sem divergir.

## O caminho de uma matéria

```
PDF ──(pdf.js, no cliente)──► texto ──► POST /materias
                                          │
                                          ├─ fatiar em blocos de 2.800 chars
                                          ├─ amostrar o documento INTEIRO ──► mapear temas (1 chamada)
                                          └─ gerar a trilha do 1º tema:
                                               achar o trecho relevante, e então
                                               em paralelo:
                                               ├─ aula            (1 chamada)
                                               ├─ prova    5 + 5  (2 chamadas, em série)
                                               └─ fixação  5 + 5  (2 chamadas, em série)
```

**A extração do PDF roda no cliente.** Evita subir o arquivo inteiro, mantém o
backend sem parser de PDF e é o mesmo pdf.js que o protótipo já usava. O
servidor só quer o texto.

As duas famílias vão em série *dentro* de si porque o segundo lote precisa
saber o que o primeiro criou, para não repetir. Entre si, tudo é paralelo.

**O primeiro tema é gerado junto com o upload.** O aluno sai da tela de upload
direto para uma aula, em vez de cair numa lista de temas trancados. Os outros
temas ele gera quando quiser — cada um gasta cota.

## Prompt caching: o que funciona e o que não funciona

O cache da Anthropic casa por **prefixo**, na ordem `tools → system → messages`.
Qualquer byte diferente no prefixo invalida tudo depois dele. Daí o desenho:

```
system[0]  PREÂMBULO      idêntico em toda chamada
system[1]  material       o trecho do tema  ◄── marcador de cache aqui
messages   tarefa         o que varia: aula? prova? fixação?
```

Nada que mude por chamada pode entrar no preâmbulo ou no bloco do material —
nem data, nem id, nem o nome do tema. Por isso o nome do tema mora na tarefa.

**O limite, medido em 08/09/2026 numa geração real:** o esquema do structured
output entra no prefixo **antes** do `system`, junto com as tools. Como cada
tipo de chamada usa um esquema diferente (aula, prova, fixação), elas **nunca
compartilham cache**, mesmo com material idêntico. O log da primeira geração
mostrou três escritas de tamanhos diferentes — 3.920, 4.707 e 4.213 tokens —
onde o desenho original esperava uma escrita e quatro leituras.

A consequência prática: **o cache é por família de chamada, não do tema
inteiro.** O material só é marcado para cache quando a família tem mais de um
lote para ler de volta (`cachearMaterial` em `PedidoGeracao`); marcar numa
chamada única é dinheiro jogado fora, porque escrever custa 1,25×.

Com a correção, a aula deixou de ir sozinha na frente (o motivo dela ir primeiro
era justamente aquecer um cache que não era compartilhado) e passou a rodar em
**paralelo** com as duas famílias. Resultado medido no mesmo material:

| | antes | depois |
|---|---|---|
| custo do tema | US$ 0,1227 | US$ 0,1033 |
| tempo de parede | 1m53s | 1m23s |
| escritas de cache sem leitura | 3 | 0 |

## Custo por tema

**Medido**, não estimado: toda geração devolve `custoUSD` na resposta e loga o
detalhe por chamada. Um tema de 20 questões com aula, sobre uma apostila de
8.000 caracteres, com `claude-sonnet-5`:

```
chamada                       usd  entrada   saida   pensa  cache_w  cache_r
mapa_do_material          0.01219     1954     828       0        0        0
aula                      0.01382     3070     768       0        0        0
questoes_de_prova         0.02796      436    1902      62     3226        0
exercicios_de_fixacao     0.01853      386     846       0     3720        0
questoes_de_prova         0.02046      594    1863     107        0     3226
exercicios_de_fixacao     0.01033      529     853      24        0     3720
TOTAL                     0.10329
```

**US$ 0,10 por tema** — bem acima dos US$ 0,03 que o handoff estimava. A
diferença não é desperdício: são os **tokens de saída**, que sozinhos respondem
por ~65% da conta. Questão no padrão ENADE tem texto-base mais cinco
alternativas longas, e isso dá ~380 tokens por questão. O raciocínio do modelo
(coluna `pensa`) é irrelevante aqui — menos de 200 tokens no total.

No plano básico (80 questões/mês = 4 temas), isso dá **~US$ 0,41 de IA por
assinante por mês**. Continua funcionando para uma assinatura, mas é 3× o que a
conta original supunha, e o preço precisa ser fechado com esse número.

Os controles, se apertar:

- `MODELO_IA=claude-haiku-4-5` corta o preço por token pela metade (não medido
  ainda — vale rodar antes de decidir).
- `output_config.effort` por tipo de chamada; a fixação já roda em `low`.
- Batch API (−50%) para gerar temas que o aluno não vai jogar no mesmo minuto.
- Menos alternativas por questão de prova: é o que mais pesa na saída.

## Structured outputs, com rede de segurança

A maior fonte de falha do protótipo era a IA responder JSON quebrado. As
chamadas agora usam `messages.parse()` com esquema Zod: o modelo não tem como
responder fora da forma pedida.

Duas defesas continuam de pé, porque garantia de forma não é garantia de
sentido:

1. **Fallback para texto livre.** Se a API recusar o esquema (`400`), a chamada
   é refeita pedindo JSON no texto, com o JSON Schema embutido, e a resposta
   passa pelo parser tolerante portado do protótipo.
2. **Normalização.** Toda questão passa por `normalizarQuestao`, que rejeita o
   que a forma não pega: índice da correta fora do intervalo, `ordenar` com item
   repetido (ordem ambígua), `fill` sem texto em volta da lacuna. Questão
   quebrada é descartada em silêncio; se sobrar menos de 60% do alvo, a geração
   do tema falha inteira em vez de entregar uma trilha capenga.

Os esquemas dos structured outputs são **planos** de propósito (todo campo em
toda questão, vazio quando não se aplica): união discriminada viraria `anyOf` no
JSON Schema, e schema plano com campos obrigatórios é a forma que o modo estrito
aceita sem discussão. A conversão para o tipo discriminado de verdade acontece
na normalização.

## Ofensiva server-authoritative

O handoff pede isso explicitamente, e a implementação segue a mesma lógica em
dois pontos:

- **A data vem do servidor.** O cliente manda no máximo o fuso (`x-fuso`); quem
  decide que dia é hoje é `Date.now()` do servidor formatado naquele fuso. Mudar
  o relógio do aparelho não muda nada.
- **O placar vem do servidor.** `POST /progresso/concluir` recebe as
  **respostas**, não os acertos. Quem corrige, conta XP e move a ofensiva é o
  servidor. Placar enviado pelo cliente é pedido, não fato.

As regras de borda estão em `packages/shared/src/ofensiva.ts` e todas têm teste:
concluir duas vezes no mesmo dia não conta duas vezes; congelamento cobre um dia
perdido e só é gasto se cobrir o buraco inteiro; data guardada no futuro (fuso
mudou, relógio voltou) não zera a ofensiva; e quem estudou ontem continua vendo
o número cheio até o dia virar.

A resposta da conclusão já devolve as **tags dos conceitos errados** — é o
insumo da revisão espaçada, que ainda não foi construída.

## Autenticação

Sessão com **token opaco**, não JWT. JWT não dá para revogar sem uma lista de
bloqueio — que é um banco de sessões com outro nome — e obriga a cuidar de
chave de assinatura e de armadilha de algoritmo. Um token aleatório de 32 bytes
guardado no banco revoga na hora e faz o "sair de todos os aparelhos" sair de
graça.

O que o banco guarda é o **SHA-256 do token**, nunca o token. Vazamento do banco
não entrega a sessão de ninguém, pela mesma razão que não se guarda senha crua.
SHA-256 basta aqui: o token já tem 256 bits de entropia, então não há dicionário
a percorrer — o motivo de usar KDF cara em senha não se aplica.

**Senha com scrypt**, do próprio Node. É uma KDF cara de propósito: custa
memória, o que encarece muito o ataque com GPU. bcrypt e argon2 fariam o mesmo,
mas são módulos nativos que precisam compilar. O formato guardado
(`scrypt$N$r$p$sal$hash`) leva os parâmetros junto, o que permite endurecer o
custo depois sem invalidar as senhas já cadastradas.

Decisões que valem registro:

- **O guarda é de escopo, não de rota.** `exigirSessao` entra como `preHandler`
  no registro que contém as rotas protegidas. Rota nova nasce protegida; não
  existe a chance de esquecer numa.
- **E-mail inexistente e senha errada respondem igual.** Diferenciar entregaria
  a lista de quem tem conta. O caminho sem conta ainda gasta um hash falso, para
  não dar para distinguir pelo relógio.
- **Freio de força bruta em memória** (8 tentativas por IP+e-mail em 15 min).
  Segura o caso óbvio sem exigir Redis. Em várias instâncias cada uma conta a
  sua, então é piso, não teto — um limitador compartilhado entra junto com o
  deploy multi-instância.
- **Sessão de 90 dias, renovada por uso.** App de hábito diário não pode pedir
  login toda semana. A renovação só grava se passou de um dia, senão seria uma
  escrita no banco por requisição — incluindo o polling da geração.
- **O que o aluno gerou antes de ter conta vem junto.** No cadastro, o app manda
  o id do aparelho e o servidor passa as matérias para a conta nova. Sem isso, a
  primeira coisa que ele faria depois de se cadastrar era perder o que gerou. Um
  aparelho já reivindicado não é transferido de novo.
- **No app, o token vai para o Keychain/Keystore** (`expo-secure-store`), não
  para o `AsyncStorage`, que é texto puro no sistema de arquivos.

O que ainda não existe: recuperação de senha (precisa de envio de e-mail),
verificação de e-mail e login social.

## Persistência

**SQLite, pelo módulo nativo do Node** (`node:sqlite`) — zero dependências.
O arquivo fica em `dados/estudaai.db` e o caminho é configurável por `BANCO`.

O repositório em memória existiu para exercitar a geração antes do banco, e a
troca não foi planejamento: foi um teste do app que morreu porque o servidor
reiniciou e levou junto uma matéria que custou US$ 0,11 para gerar. Um app que
perde o material do aluno num restart não é um app.

A matéria é guardada como JSON numa coluna, validada pelo mesmo contrato Zod na
leitura. Normalizar temas e questões em tabelas só paga a pena quando houver
consulta por questão — o que chega junto com a revisão espaçada, não antes.

`node:sqlite` é marcado como experimental pelo Node e imprime um aviso na
subida. A API que usamos (`DatabaseSync`, `prepare`, `run`, `get`, `all`) é
estável na prática, e o custo de trocar por outro driver é um arquivo.

Trocar por Postgres no deploy é escrever outra classe que implemente
`Repositorio`, sem tocar nas rotas. O modelo relacional correspondente, para
quando isso acontecer:

```prisma
model Usuario {
  id                 String   @id @default(uuid())
  plano              String   @default("basico")
  xp                 Int      @default(0)
  fuso               String   @default("America/Sao_Paulo")
  // Ofensiva: dia LOCAL (AAAA-MM-DD) no fuso do usuário, gravado pelo servidor.
  ultimoDiaConcluido String?
  streak             Int      @default(0)
  maiorStreak        Int      @default(0)
  congelamentos      Int      @default(2)
  materias           Materia[]
  cotas              CotaMes[]
  conclusoes         Conclusao[]
  erros              ErroConceito[]
  anotacoes          Anotacao[]
  credencial         Credencial?
  sessoes            Sessao[]
}

model Credencial {
  usuario   Usuario  @relation(fields: [usuarioId], references: [id])
  usuarioId String   @id
  email     String   @unique
  // scrypt$N$r$p$sal$hash — os parametros vao junto, para dar para endurecer
  // o custo depois sem invalidar as senhas ja cadastradas.
  senhaHash String
  criadaEm  DateTime @default(now())
}

model Sessao {
  // SHA-256 do token. O token em si nunca e gravado.
  tokenHash String   @id
  usuario   Usuario  @relation(fields: [usuarioId], references: [id])
  usuarioId String
  criadaEm  DateTime @default(now())
  expiraEm  DateTime
  ultimoUso DateTime
  @@index([usuarioId])
  @@index([expiraEm])
}

model CotaMes {
  id            String  @id @default(uuid())
  usuario       Usuario @relation(fields: [usuarioId], references: [id])
  usuarioId     String
  competencia   String  // "AAAA-MM"
  questoesUsadas Int    @default(0)
  @@unique([usuarioId, competencia])
}

model Materia {
  id        String   @id @default(uuid())
  usuario   Usuario  @relation(fields: [usuarioId], references: [id])
  usuarioId String
  nome      String
  cor       String
  criadaEm  DateTime @default(now())
  // Texto do PDF, fatiado. Fica fora da Materia porque é grande e só o servidor lê.
  blocos    String[]
  temas     Tema[]
}

model Tema {
  id        String   @id @default(uuid())
  materia   Materia  @relation(fields: [materiaId], references: [id])
  materiaId String
  nome      String
  conceito  String
  chave     String[]
  ordem     Int
  aula      Json?     // { blocos, resumo } — null enquanto não foi gerado
  questoes  Questao[]
}

model Questao {
  id         String @id @default(uuid())
  tema       Tema   @relation(fields: [temaId], references: [id])
  temaId     String
  ordem      Int
  tipo       String // mc | tf | fill | match | cenario | calc | ordenar
  familia    String // prova | fixacao
  // O corpo segue o contrato de packages/shared/src/questao.ts.
  corpo      Json
  tags       String[]
}

model Conclusao {
  id        String   @id @default(uuid())
  usuario   Usuario  @relation(fields: [usuarioId], references: [id])
  usuarioId String
  temaId    String
  acertos   Int
  total     Int
  em        DateTime @default(now())
  @@index([usuarioId, temaId])
}

// Base da revisão espaçada: erro por conceito, não por questão.
model ErroConceito {
  id          String   @id @default(uuid())
  usuario     Usuario  @relation(fields: [usuarioId], references: [id])
  usuarioId   String
  tag         String
  erros       Int      @default(0)
  acertos     Int      @default(0)
  proximaVez  DateTime
  @@unique([usuarioId, tag])
}

model Anotacao {
  id        String   @id @default(uuid())
  usuario   Usuario  @relation(fields: [usuarioId], references: [id])
  usuarioId String
  temaId    String
  tipo      String   // grifo | nota
  texto     String
  criadaEm  DateTime @default(now())
}
```

## O que ainda é provisório (e está marcado no código)

- **Identidade.** `apps/api/src/rotas/contexto.ts` lê o usuário de um cabeçalho,
  sem verificar nada. Todo o resto do código já trata o id como confiável, então
  ligar a autenticação de verdade é mudar só esse arquivo.
- **Som.** O protótipo sintetizava som com Web Audio; React Native não tem
  equivalente e som exigiria arquivos de áudio, que ainda não existem. O app
  entrega vibração (`expo-haptics`), que no celular é o retorno que mais se
  sente.
- **Recuperação de senha.** Não existe. Quem esquecer a senha perde a conta até
  o envio de e-mail entrar.
- **Anotações.** O app guarda grifos e notas no aparelho (`AsyncStorage`); o
  backend ainda não tem endpoint para elas. Trocar de celular perde as
  anotações.
