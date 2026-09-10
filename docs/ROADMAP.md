# Roadmap

A ordem é a do handoff (§4 e §5), com o estado de cada item.

## Feito

**1. Backend de geração.** Guarda a chave da Anthropic, chama a API
server-side, aplica a cota do plano e usa prompt caching do material. Mapeia o
PDF em temas e gera aula + 20 questões por tema, nos 7 tipos, nas duas
famílias. A geração roda como **tarefa em segundo plano**: a rota responde na
hora e o app acompanha o progresso, então a conexão pode cair sem perder o
trabalho.

**3a. Ofensiva server-authoritative.** A data vem do relógio do servidor no
fuso do aluno; a correção das respostas também é do servidor. Congelamentos,
marcos e casos de borda com teste.

**3b. Banco.** SQLite pelo módulo nativo do Node, sem dependência. Usuários,
matérias, temas, questões, ofensiva, cota e progresso sobrevivem ao restart.

**4. Processamento de PDF.** Extração **no servidor** (`unpdf`), porque React
Native não roda pdf.js. O app manda o arquivo em multipart.

**O app.** React Native + Expo, com as telas do protótipo portadas:
onboarding, home, nova matéria, geração com progresso, matéria, aula com
anotações, os 7 tipos de exercício, conclusão com comemoração de ofensiva,
tela de ofensiva, missões, notas e perfil.

**Autenticação.** Conta com e-mail e senha (scrypt), sessão por token opaco
revogável de 90 dias, freio de força bruta e o token no Keychain/Keystore do
aparelho. O que o aluno gerou antes de se cadastrar é transferido para a conta
nova. Entrando com o mesmo e-mail em outro celular, tudo está lá.

## Próximo

**Recuperação de senha.** Hoje quem esquece a senha perde a conta. Precisa de
envio de e-mail — é a única peça que exige um serviço de fora.

**Anotações no servidor.** O app guarda grifos e notas em `AsyncStorage`. A
tabela está desenhada em `ARQUITETURA.md`; falta o endpoint.

**Marca-texto na aula.** O protótipo deixava grifar um trecho selecionado. O
app hoje só permite escrever notas — seleção de texto em React Native precisa
de tratamento próprio e ficou para depois.

## Trazido do Duolingo

O plano completo, com o que adotar e o que recusar, está em
[`DUOLINGO.md`](DUOLINGO.md).

**Feito: glossário no toque.** O termo técnico do tema fica sublinhado na aula,
no enunciado e na explicação; um toque mostra o significado. Sai junto com a
aula, na mesma chamada — não custa geração.

**A seguir, e nenhum deles custa IA:**

1. Guardar o erro por conceito e uma tela de revisão que **reaproveita** as
   questões já geradas. Estudar mais deixa de exigir gerar mais.
2. Agenda de revisão por conceito: o intervalo dobra a cada acerto e volta ao
   início a cada erro (SM-2 enxuto — sem população para treinar modelo, a regra
   simples é a honesta).
3. Flashcards do próprio glossário, na mesma agenda.

**Explicar o erro sob demanda** custa uma chamada curta, e só quando o aluno
pede o botão.

## Depois

**Revisão espaçada.** A conclusão já devolve as tags dos conceitos errados, e o
app já as mostra em "Vale revisar". Falta guardar (`ErroConceito`) e ressurgir
com o tempo.

**Notificações push.** Lembrete de ofensiva pelo Expo Notifications. É o
ingrediente que traz a pessoa de volta.

**Assinatura.** A cota já é aplicada no servidor e o plano `basico` já vale 80
questões/mês; falta o gateway e mudar o plano depois do pagamento.

**Deploy.** SQLite resolve local e self-host, e é o que o app usa hoje. Um
deploy serverless (Vercel, Netlify) não serve como está: o disco é efêmero e a
fila de tarefas em memória não sobrevive entre invocações. As duas peças que
faltavam já estão escritas — `RepositorioPostgres` e `FilaPostgres` — mas
**ainda não estão ligadas nem testadas contra um Postgres de verdade**. Ligar
significa: escolher o host, apontar `DATABASE_URL`, rodar os testes do
repositório contra o Postgres e adaptar o entrypoint. Um host com processo longo
e disco (Render, Fly, Railway) roda o código como está, sem nada disso.

**Animação de personagem.** Assets Rive (`.riv`) ou Lottie. Não sai por código —
precisa de animador ou de arquivo pronto.

O caminho legítimo é a [Rive Community](https://rive.app/community/files/): os
arquivos de lá são **CC BY**, uso comercial liberado mediante crédito ao autor, e
o runtime é MIT. **O que não dá é usar os personagens do Duolingo**: Duo é marca
registrada (Reg. #4588574) e a arte é protegida — qualquer `.riv` dele que
apareça no GitHub foi extraído do app.

Tem um custo técnico a considerar antes: o `@rive-app/react-native` oficial **não
funciona na web**, e web é como o app roda hoje (`npm start`, um endereço só). O
wrapper da comunidade `rive-rnw` cobre web e celular, mas é dependência de
terceiro para uma coisa que é enfeite.

Antes disso, o movimento que dá para fazer em código já foi feito: confete,
mola, cascata, contador que sobe e a **chama tremeluzente** da ofensiva (portada
do protótipo, com o giro preso na base — e parada para quem pede menos
movimento no sistema).

## Ideias que o código já deixou prontas

- **Batch API (−50%)** para gerar em lote os temas que o aluno não vai jogar
  agora.
- **`MODELO_IA`** por variável de ambiente: dá para rodar um A/B de qualidade
  entre Haiku 4.5 e Sonnet 5 sem tocar no código.
- **`custoUSD` em toda geração**: a margem por assinante é observável desde o
  primeiro dia.
