# O que dá para trazer do Duolingo

Documento de decisão, não de inspiração. Cada item diz **o que o Duolingo faz**,
**o que isso vira aqui** (nosso domínio é apostila de faculdade, não idioma) e
**quanto custa de IA** — que é a variável que decide, porque quem estuda paga a
geração.

Tradução do vocabulário, que vale para o documento inteiro:

| Duolingo | Estuda AI |
|---|---|
| palavra / *word* | termo técnico da matéria |
| *skill* / unidade | tema |
| exercício | questão (prova ENADE ou fixação) |
| curso | matéria (a apostila que o aluno subiu) |

---

## O que o Duolingo faz, e por quê

**Repetição espaçada com meia-vida.** O modelo público deles (*half-life
regression*) estima, para cada item, quanto tempo até a chance de lembrar cair
para 50%, e agenda a revisão para esse ponto — nem antes (não reforça nada) nem
depois (já esqueceu). Não é intervalo fixo: a meia-vida cresce a cada acerto e
encolhe a cada erro.

**Erros viram conteúdo.** Errou, o assunto volta com mais frequência; o
*Practice Hub* tem uma seção só de erros para refazer.

**Modelo do aluno (*Birdbrain*).** A cada exercício o sistema atualiza duas
coisas ao mesmo tempo: quão difícil é aquele item e quão bom o aluno está
naquela habilidade. Daí sai a dificuldade da próxima lição.

**Dica no toque.** Palavra nova aparece destacada; tocar (ou passar o mouse)
mostra o significado. O objetivo declarado é que ninguém trave por não conhecer
uma palavra — travar por vocabulário não ensina nada, só desiste.

**Flashcards.** Recall ativo do termo, separado do exercício.

**Revisão dirigida.** Refazer uma unidade específica, ou pedir prática do que
está mais fraco.

---

## O que adotar aqui

Em ordem de valor pelo custo. "Custo de IA" é por sessão de estudo do aluno.

### 1. Glossário no toque — custo ~zero — **feito**

O equivalente direto da dica de palavra, e para contabilidade é mais útil ainda
do que para idioma: "regime de competência", "provisão", "exaustão" e
"realizável a longo prazo" são as palavras que fazem o aluno parar de ler.

Como sai de graça: os termos vêm **junto com a aula**, na mesma chamada que já
existe. Nenhuma chamada nova, nenhum token relevante a mais. Ficam guardados no
tema; o app destaca o termo na aula e nos enunciados e mostra a definição ao
toque.

### 2. Revisar os erros — custo zero

O `POST /api/progresso/concluir` já devolve quais conceitos o aluno errou, e o
app já mostra "Vale revisar". Falta o que o Duolingo faz depois: guardar e
**trazer de volta**.

Sai de graça porque **reaproveita questão já gerada**. As 20 questões do tema
ficam salvas; uma sessão de revisão é uma seleção nova delas, não uma geração.
Estudar mais não custa mais — só gerar tema novo custa.

### 3. Agenda de revisão por conceito — custo zero

A meia-vida do Duolingo, na versão honesta do que dá para fazer com os dados que
temos: cada conceito (a `tag` da questão) tem um intervalo que **dobra a cada
acerto e volta ao início a cada erro**. É SM-2 enxuto. Sem `Birdbrain`, sem
regressão treinada — não temos milhões de alunos para treinar nada, e fingir que
temos seria pior do que a regra simples.

### 4. Explicar o erro — custo pequeno, só quando pedem

O "explique minha resposta" do Duolingo Max. Aqui: um botão na tela de correção,
uma chamada curta, **só quando o aluno pede**. Cabe adiar até as três primeiras
existirem.

### 5. Flashcards do glossário — custo zero

Tendo o glossário do item 1, o baralho já existe: termo de um lado, definição do
outro, repetição espaçada pela mesma agenda do item 3.

---

## O que NÃO trazer

**Vidas / corações.** Errar 5 vezes e ser posto para fora é o mecanismo mais
odiado do Duolingo, e lá ele existe para vender assinatura. Aqui o aluno já
pagou a geração do tema com o próprio dinheiro — bloqueá-lo é cobrar duas vezes.
Errar tem que **trazer o assunto de volta**, não interromper o estudo.

**Ligas e ranking.** Precisa de outros alunos para funcionar e o app é de uso
individual. Ranking com uma pessoa só é enfeite.

**Birdbrain.** Modelo estatístico treinado em população. Sem população, o
resultado é ruído com nome bonito.

---

## Ordem de execução

1. ~~Glossário no toque~~ — **pronto**, sai junto com a aula, sem chamada nova
2. Guardar erro por conceito + tela de revisão que reaproveita questão
3. Agenda de revisão (intervalo dobra no acerto, zera no erro)
4. Explicar o erro sob demanda
5. Flashcards

Os três primeiros não mexem no custo de nada. O que muda para quem estuda é que
**estudar mais deixa de exigir gerar mais**.

---

Fontes consultadas: [Practice
Hub](https://blog.duolingo.com/guide-to-duolingo-practice-hub/), [A Trainable
Spaced Repetition Model for Language
Learning](https://research.duolingo.com/papers/settles.acl16.pdf),
[duolingo/halflife-regression](https://github.com/duolingo/halflife-regression),
[Duolingo Research](https://research.duolingo.com/),
[dicas de tradução](https://www.duolingo.com/help/updated-courses),
[flashcards](https://blog.duolingo.com/duolingo-flashcards/).
