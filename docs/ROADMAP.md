# Roadmap

A ordem é a do handoff (§4 e §5), com o estado de cada item.

## Feito

**1. Backend de geração.** Guarda a chave da Anthropic, chama a API server-side,
aplica a cota do plano e usa prompt caching do material. Mapeia o PDF em temas e
gera aula + 20 questões por tema, nos 7 tipos, nas duas famílias.

**3a. Ofensiva server-authoritative.** A data vem do relógio do servidor no fuso
do aluno; a correção das respostas também é do servidor. Congelamentos, marcos e
casos de borda com teste.

**4. Processamento de PDF.** Extração no cliente com pdf.js; o backend recebe
texto. O banco de testes em `/teste/` exercita esse caminho.

## Próximo

**App em React Native + Expo.** Portar as telas do protótipo (onboarding, home,
matéria, aula com marca-texto, os 7 tipos de exercício, tela de ofensiva,
missões, perfil, notas) contra a API que já existe. O `packages/shared` já
entrega os tipos e as regras prontos para o app.

Duas coisas a resolver junto:

- **Geração como job.** Um tema são 5 chamadas de IA e a requisição segura por
  30–60s. Para o app, `POST` devolve um id e o cliente acompanha o status —
  assim a tela de "destrinchando o material" tem progresso de verdade e a
  conexão não precisa ficar de pé.
- **Aula e questões em duas etapas.** A aula sai na primeira chamada; dá para
  liberar a leitura enquanto os exercícios ainda estão sendo gerados.

## Depois

**2 + 3b. Autenticação e banco.** Trocar `RepositorioMemoria` por Postgres (o
modelo está em `ARQUITETURA.md`) e o cabeçalho `x-usuario-id` por token de
verdade. São os dois pontos já isolados de propósito.

**6. Revisão espaçada.** A conclusão de tema já devolve as tags dos conceitos
errados. Falta guardar (`ErroConceito`) e ressurgir com o tempo — uma trilha de
revisão montada com as questões dos conceitos vencidos.

**5. Notificações push.** Lembrete de ofensiva pelo Expo Notifications. É o
ingrediente que traz a pessoa de volta; depende do app nativo estar de pé.

**7. Assinatura.** A cota já é aplicada no servidor e o plano `basico` já vale
80 questões/mês; falta o gateway e mudar o plano do usuário depois do pagamento.

**8. Animação de personagem.** Assets Rive ou Lottie. Não sai por código.

## Ideias que o código já deixou prontas para depois

- **Batch API (−50%)** para gerar em lote os temas que o aluno não vai jogar
  agora.
- **`MODELO_IA`** por variável de ambiente: dá para rodar um A/B de qualidade
  entre Haiku 4.5 e Sonnet 5 sem tocar no código.
- **`custoUSD` em toda geração**: a margem por assinante é observável desde o
  primeiro dia, não estimada.
