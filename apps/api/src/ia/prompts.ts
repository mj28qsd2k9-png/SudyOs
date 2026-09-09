/**
 * Prompts de geracao — portados do prototipo `estuda-ai-app.html`.
 *
 * A divisao entre `PREAMBULO` (system, identico em todas as chamadas) e as
 * instrucoes de tarefa (user, uma por chamada) nao e estetica: e o que faz o
 * prompt caching funcionar. O cache casa por PREFIXO, na ordem tools -> system
 * -> messages. Com o material no fim do system e a tarefa no user, as tres
 * chamadas de um tema (aula, prova, fixacao) compartilham o mesmo prefixo e so
 * a primeira paga o material inteiro.
 *
 * Corolario: nada que varie por chamada pode entrar no PREAMBULO ou no bloco do
 * material. Nem data, nem id, nem nome do tema.
 */

export const PREAMBULO =
  'Voce e um professor preparando material de estudo para um aluno que NAO leu ' +
  'a apostila. Trabalhe SO com o CONTEUDO fornecido: nao invente fatos que nao ' +
  'estejam nele e nao complete com conhecimento externo. Escreva sempre na ' +
  'mesma lingua do CONTEUDO.';

export function blocoMaterial(conteudo: string): string {
  return `CONTEUDO:\n${conteudo}`;
}

/**
 * Mapeia os temas olhando o documento inteiro, nao so o comeco.
 *
 * A quantidade de temas acompanha o tamanho do material. Pedir sempre "4 a 6"
 * funciona num resumo e falha numa apostila: medido em 09/09/2026, um material
 * com 8 unidades distintas virou 6 temas tirados das 6 primeiras, e as duas
 * ultimas unidades ficaram sem tema nenhum. O handoff diz "uma materia tem ~5
 * temas", que descreve o caso comum — a intencao e que um tema seja um dia de
 * estudo, e livro grande tem mais dias.
 */
export function tarefaOutline(minimo: number, maximo: number): string {
  return (
    'Identifique a materia deste documento e liste os temas de estudo dele.\n\n' +
    'Antes de escolher, percorra TODOS os trechos mostrados e anote quais ' +
    'assuntos diferentes aparecem — inclusive os que so aparecem no fim do ' +
    'material. Depois crie um tema para cada assunto encontrado.\n\n' +
    `Use de ${minimo} a ${maximo} temas: quantos o material pedir, nem mais nem ` +
    'menos. Nao invente subdivisao para chegar ao maximo, e nao junte assuntos ' +
    'diferentes num tema so para caber no minimo — assunto que aparece no ' +
    'material e fica sem tema e material que o aluno nunca vai estudar.\n\n' +
    'Ordene os temas como aparecem no material. Para cada tema, escreva um ' +
    'conceito de 1 a 2 frases suas e liste de 3 a 5 palavras-chave que ajudem a ' +
    'localizar esse tema no material.'
  );
}

/** Ensinar antes de cobrar: a aula abre o tema. */
export function tarefaAula(tema: string): string {
  return (
    `Ensine o tema "${tema}" para um aluno que nunca viu esse assunto. ` +
    'Linguagem clara e direta, comecando do basico, com exemplos quando ajudarem. ' +
    'Divida em 3 a 4 blocos curtos, cada um com titulo e 2 a 4 frases. ' +
    'Termine com um resumo de 3 pontos-chave curtos.'
  );
}

/**
 * Questoes estilo prova (padrao ENADE, como a Estacio usa).
 * As regras negativas vieram de erro observado no prototipo: sem elas o modelo
 * escorrega para pegadinha e para alternativa obviamente errada.
 */
export function tarefaProva(tema: string, quantas: number, evitar?: string): string {
  return [
    `Elabore ${quantas} questoes de PROVA DE FACULDADE sobre o tema "${tema}", ` +
      'no padrao ENADE.',
    '',
    'Cada questao tem tres partes: (1) um texto-base curto que contextualiza; ' +
      '(2) um comando claro ("assinale a alternativa correta", "avalie as ' +
      'afirmativas"); (3) cinco alternativas plausiveis, de tamanho parecido, ' +
      'com apenas UMA correta.',
    '',
    'Regras:',
    '- Linguagem formal.',
    '- Cobre COMPREENSAO e APLICACAO, nao memorizacao literal.',
    '- Sem pegadinha e sem termos absolutos ("sempre", "nunca", "todo").',
    '- Sem "todas as anteriores" nem "nenhuma das anteriores".',
    '- Sem enunciado negativo ("assinale a INCORRETA").',
    '- As alternativas erradas devem ser erros que um aluno realmente cometeria.',
    '- Varie a posicao da alternativa correta entre as questoes.',
    '',
    'Use o tipo "cenario" quando a questao partir de um caso concreto (o caso vai ' +
      'no campo contexto) e "mc" nos demais. Uma das questoes pode ser do formato ' +
      '"analise as afirmativas I, II e III", com as alternativas combinando-as.',
    evitar ? `\nNao repita estas questoes ja criadas: ${evitar}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Exercicios de fixacao estilo Duolingo: repeticao ativa, nao avaliacao. */
export function tarefaFixacao(tema: string, quantas: number, evitar?: string): string {
  return [
    `Crie ${quantas} exercicios de FIXACAO sobre o tema "${tema}", no estilo ` +
      'Duolingo: curtos, diretos, para gravar termos, definicoes e sequencias por ' +
      'repeticao ativa. Nao e prova, e treino.',
    '',
    'Use tipos VARIADOS — pelo menos tres tipos diferentes entre "fill" ' +
      '(completar a frase), "match" (ligar pares), "ordenar" (colocar em ordem) e ' +
      '"tf" (verdadeiro ou falso).',
    '',
    'Regras por tipo:',
    '- fill: a lacuna fica ENTRE os campos antes e depois; as 3 opcoes precisam ser ' +
      'do mesmo tipo de coisa (nao misture um termo com uma frase inteira). A ' +
      'palavra da resposta NAO pode aparecer em antes nem em depois — se ela ja ' +
      'estiver escrita na frase, a questao se responde sozinha e o texto fica ' +
      'repetido. Leia a frase montada antes de entregar.',
    '- match: 3 pares, cada definicao com no maximo 8 palavras.',
    '- ordenar: use uma sequencia que exista de verdade no conteudo (etapas de um ' +
      'processo, ordem de grandeza, linha do tempo), com itens que nao se repetem.',
    '- tf: afirmacoes que valha a pena corrigir; metade verdadeiras, metade falsas.',
    evitar ? `\nNao repita estes exercicios ja criados: ${evitar}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
