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

## Depois

**Revisão espaçada.** A conclusão já devolve as tags dos conceitos errados, e o
app já as mostra em "Vale revisar". Falta guardar (`ErroConceito`) e ressurgir
com o tempo.

**Notificações push.** Lembrete de ofensiva pelo Expo Notifications. É o
ingrediente que traz a pessoa de volta.

**Som.** O protótipo sintetizava com Web Audio, que não existe em React Native.
O app entrega vibração; som precisa de arquivos de áudio.

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

**Animação de personagem.** Assets Rive ou Lottie. Não sai por código.

## Ideias que o código já deixou prontas

- **Batch API (−50%)** para gerar em lote os temas que o aluno não vai jogar
  agora.
- **`MODELO_IA`** por variável de ambiente: dá para rodar um A/B de qualidade
  entre Haiku 4.5 e Sonnet 5 sem tocar no código.
- **`custoUSD` em toda geração**: a margem por assinante é observável desde o
  primeiro dia.
