import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { corrigir, temaFoiGerado, type Materia, type Questao, type Tema } from '@estudaai/shared';
import { useEstado, useSessao } from '../../../src/dados/estado';
import { api, type ResultadoConclusao } from '../../../src/api/cliente';
import { Barra, Botao, NumeroQueSobe, Pulinho, Sacudida } from '../../../src/ui/componentes';
import { Confete } from '../../../src/ui/confete';
import { Chama } from '../../../src/ui/icones';
import { RenderQuestao, rotuloDoTipo, type EstadoResposta } from '../../../src/ui/questao';
import { voltar } from '../../../src/ui/navegar';
import { retorno } from '../../../src/ui/retorno';
import { cores, espaco, raio, tamanho } from '../../../src/ui/tema';

type Fase = 'carregando' | 'aula' | 'questoes' | 'fim';

/**
 * A trilha de um tema, do comeco ao fim.
 *
 * Fica tudo numa tela so porque e um fluxo, nao um lugar: aula, exercicios e
 * conclusao sao passos de uma sessao de estudo. Sair no meio devolve o aluno
 * para a materia, e nada e enviado — a conclusao so conta quando ele termina.
 */
export default function Trilha() {
  const { materiaId, temaId } = useLocalSearchParams<{ materiaId: string; temaId: string }>();
  const { pronto, recarregar, adicionarAnotacao } = useEstado();
  const sessao = useSessao();
  const router = useRouter();

  const [materia, setMateria] = useState<Materia | null>(null);
  const [fase, setFase] = useState<Fase>('carregando');
  const [passoAula, setPassoAula] = useState(0);
  const [indice, setIndice] = useState(0);
  const [resposta, setResposta] = useState<EstadoResposta>({ resposta: null, pronta: false });
  const [correcao, setCorrecao] = useState<boolean | null>(null);
  const [respostas, setRespostas] = useState<unknown[]>([]);
  const [acertosLocais, setAcertosLocais] = useState(0);
  const [resultado, setResultado] = useState<ResultadoConclusao | null>(null);
  const [confete, setConfete] = useState(0);
  const [tremor, setTremor] = useState(0);
  const [pulo, setPulo] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const tema: Tema | undefined = materia?.temas.find((t) => t.id === temaId);
  const questoes: Questao[] = tema?.questoes ?? [];

  useEffect(() => {
    // Espera a sessao guardada. Sem isto, uma abertura direta (link ou
    // notificacao) busca com um id de aparelho recem-sorteado, toma 404 e
    // devolve o aluno para a home — parecendo que o tema sumiu.
    if (!pronto) return;
    void (async () => {
      if (!materiaId) return;
      try {
        const m = await api.materia(sessao, materiaId);
        setMateria(m);
        const t = m.temas.find((x) => x.id === temaId);
        setFase(t?.aula?.blocos.length ? 'aula' : 'questoes');
      } catch {
        voltar('/(abas)');
      }
    })();
  }, [pronto, materiaId, temaId, sessao, router]);

  const paraMateria = () => voltar(materiaId ? `/materia/${materiaId}` : '/(abas)');

  const sair = useCallback(() => {
    if (fase === 'fim') {
      paraMateria();
      return;
    }
    Alert.alert('Sair da trilha?', 'Seu progresso nesta sessão não será salvo.', [
      { text: 'Continuar estudando', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: paraMateria },
    ]);
    // `paraMateria` so depende de materiaId, que nao muda enquanto a tela vive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, materiaId]);

  const verificar = () => {
    const questao = questoes[indice];
    if (!questao) return;
    // A mesma funcao que o servidor usa para pontuar: o app so antecipa o
    // resultado para o aluno aprender na hora.
    const acertou = corrigir(questao, resposta.resposta);
    setCorrecao(acertou);
    setRespostas((r) => [...r, resposta.resposta]);
    if (acertou) {
      setAcertosLocais((a) => a + 1);
      retorno.acerto();
      setPulo((p) => p + 1);
      setConfete((c) => c + 1);
    } else {
      retorno.erro();
      setTremor((t) => t + 1);
    }
  };

  const proxima = async () => {
    retorno.toque();
    setCorrecao(null);
    setResposta({ resposta: null, pronta: false });
    setConfete(0);

    if (indice + 1 < questoes.length) {
      setIndice(indice + 1);
      return;
    }

    setEnviando(true);
    try {
      const r = await api.concluir(sessao, materiaId!, temaId!, [...respostas, resposta.resposta].slice(0, questoes.length));
      setResultado(r);
      if (r.ofensiva.subiu) retorno.conquista();
      setConfete((c) => c + 1);
      await recarregar();
    } catch {
      // Sem rede a conclusao nao registra. Mostrar o resultado local seria
      // mentir sobre XP e ofensiva, entao a tela diz a verdade.
      setResultado(null);
    } finally {
      setEnviando(false);
      setFase('fim');
    }
  };

  if (fase === 'carregando' || !tema) {
    return (
      <SafeAreaView style={e.tela}>
        <View style={e.centro}>
          <Text style={e.carregando}>Abrindo a trilha…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!temaFoiGerado(tema)) {
    return (
      <SafeAreaView style={e.tela}>
        <View style={e.centro}>
          <Text style={e.carregando}>Este tema ainda não foi gerado.</Text>
          <Botao titulo="Voltar" aoTocar={() => router.back()} estilo={{ marginTop: espaco.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={e.tela} edges={['top', 'bottom']}>
      <Confete tocar={confete} quantidade={fase === 'fim' ? 90 : 40} />

      {fase === 'aula' && (
        <Aula
          tema={tema}
          materiaNome={materia!.nome}
          passo={passoAula}
          aoAvancar={() => {
            retorno.toque();
            const ultimo = tema.aula!.blocos.length - 1 + (tema.aula!.resumo.length ? 1 : 0);
            if (passoAula >= ultimo) setFase('questoes');
            else setPassoAula(passoAula + 1);
          }}
          aoVoltar={() => {
            retorno.toque();
            if (passoAula > 0) setPassoAula(passoAula - 1);
          }}
          aoSair={sair}
          aoAnotar={(texto) =>
            adicionarAnotacao({
              materiaNome: materia!.nome,
              temaId: tema.id,
              temaNome: tema.nome,
              tipo: 'nota',
              texto,
            })
          }
        />
      )}

      {fase === 'questoes' && questoes[indice] && (
        <>
          <View style={e.topo}>
            <Pressable onPress={sair} hitSlop={14} accessibilityLabel="Sair da trilha">
              <Text style={e.fechar}>✕</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Barra valor={indice / questoes.length} />
            </View>
          </View>

          <ScrollView contentContainerStyle={e.corpoQuestao} keyboardShouldPersistTaps="handled">
            <Text style={e.tipo}>{rotuloDoTipo(questoes[indice]!)}</Text>
            <Sacudida tocar={tremor}>
              <Pulinho tocar={pulo}>
                <RenderQuestao
                  questao={questoes[indice]!}
                  correcao={correcao}
                  aoMudar={setResposta}
                />
              </Pulinho>
            </Sacudida>
          </ScrollView>

          <View
            style={[
              e.rodape,
              correcao === true && { backgroundColor: cores.verdeFundo },
              correcao === false && { backgroundColor: cores.vermelhoFundo },
            ]}
          >
            {correcao === null ? (
              <Botao titulo="Verificar" aoTocar={verificar} desabilitado={!resposta.pronta} />
            ) : (
              <>
                <Text style={[e.tituloRetorno, { color: correcao ? cores.verdeEscuro : cores.vermelho }]}>
                  {correcao ? 'Boa!' : 'Quase.'}
                </Text>
                <Text style={e.explicacao}>{questoes[indice]!.explicacao}</Text>
                <Botao
                  titulo={indice + 1 < questoes.length ? 'Continuar' : 'Terminar'}
                  variante={correcao ? 'verde' : 'primario'}
                  carregando={enviando}
                  aoTocar={() => void proxima()}
                  estilo={{ marginTop: espaco.md }}
                />
              </>
            )}
          </View>
        </>
      )}

      {fase === 'fim' && (
        <Conclusao
          resultado={resultado}
          acertosLocais={acertosLocais}
          total={questoes.length}
          aoSair={paraMateria}
        />
      )}
    </SafeAreaView>
  );
}

/** Aula: blocos didaticos, resumo e anotacao. */
function Aula({
  tema,
  materiaNome,
  passo,
  aoAvancar,
  aoVoltar,
  aoSair,
  aoAnotar,
}: {
  tema: Tema;
  materiaNome: string;
  passo: number;
  aoAvancar: () => void;
  aoVoltar: () => void;
  aoSair: () => void;
  aoAnotar: (texto: string) => void;
}) {
  const aula = tema.aula!;
  const totalPassos = aula.blocos.length + (aula.resumo.length ? 1 : 0);
  const noResumo = passo >= aula.blocos.length;
  const [anotando, setAnotando] = useState(false);
  const [rascunho, setRascunho] = useState('');

  const salvar = () => {
    const texto = rascunho.trim();
    if (!texto) return;
    aoAnotar(texto);
    setRascunho('');
    setAnotando(false);
    retorno.acerto();
  };

  return (
    <>
      <View style={e.topo}>
        <Pressable onPress={aoSair} hitSlop={14} accessibilityLabel="Sair da aula">
          <Text style={e.fechar}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Barra valor={(passo + 1) / (totalPassos + 1)} />
        </View>
      </View>

      <ScrollView contentContainerStyle={e.corpoAula}>
        <Text style={e.migalha}>
          {materiaNome} · {tema.nome}
        </Text>

        {noResumo ? (
          <>
            <Text style={e.tituloAula}>Resumo</Text>
            {aula.resumo.map((ponto, i) => (
              <View key={i} style={e.pontoResumo}>
                <View style={e.marcador} />
                <Text style={e.textoResumo}>{ponto}</Text>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={e.tituloAula}>{aula.blocos[passo]!.titulo}</Text>
            <Text style={e.textoAula}>{aula.blocos[passo]!.texto}</Text>
          </>
        )}

        {anotando ? (
          <View style={e.caixaNota}>
            <TextInput
              value={rascunho}
              onChangeText={setRascunho}
              placeholder="O que você quer lembrar deste trecho?"
              placeholderTextColor={cores.textoFraco}
              multiline
              autoFocus
              style={e.entradaNota}
            />
            <View style={{ flexDirection: 'row', gap: espaco.sm }}>
              <Botao titulo="Salvar nota" aoTocar={salvar} estilo={{ flex: 1 }} />
              <Botao
                titulo="Cancelar"
                variante="fantasma"
                aoTocar={() => {
                  setAnotando(false);
                  setRascunho('');
                }}
                estilo={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              retorno.toque();
              setAnotando(true);
            }}
            style={e.botaoNota}
          >
            <Text style={e.botaoNotaTexto}>+ Anotar</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={e.rodape}>
        <View style={{ flexDirection: 'row', gap: espaco.sm }}>
          {passo > 0 && (
            <Botao titulo="Voltar" variante="fantasma" aoTocar={aoVoltar} estilo={{ flex: 1 }} />
          )}
          <Botao
            titulo={passo >= totalPassos - 1 ? 'Ir aos exercícios' : 'Continuar'}
            aoTocar={aoAvancar}
            estilo={{ flex: 2 }}
          />
        </View>
      </View>
    </>
  );
}

/** Tela final. Os numeros vem do servidor; sem eles, a tela diz que nao contou. */
function Conclusao({
  resultado,
  acertosLocais,
  total,
  aoSair,
}: {
  resultado: ResultadoConclusao | null;
  acertosLocais: number;
  total: number;
  aoSair: () => void;
}) {
  const acertos = resultado?.acertos ?? acertosLocais;
  const percentual = total === 0 ? 0 : Math.round((acertos / total) * 100);
  const subiu = resultado?.ofensiva.subiu ?? false;

  return (
    <ScrollView contentContainerStyle={e.corpoFim}>
      {subiu ? (
        <>
          <Chama tamanho={72} />
          <NumeroQueSobe ate={resultado!.ofensiva.streak} estilo={e.numeroOfensiva} />
          <Text style={e.tituloFim}>dias de ofensiva!</Text>
        </>
      ) : (
        <>
          <Text style={e.emoji}>{percentual >= 70 ? '🎉' : '💪'}</Text>
          <Text style={e.tituloFim}>Tema concluído!</Text>
        </>
      )}

      <View style={e.placar}>
        <View style={e.itemPlacar}>
          <NumeroQueSobe ate={resultado?.xpGanho ?? 0} prefixo="+" estilo={[e.valorPlacar, { color: cores.amarelo }]} />
          <Text style={e.rotuloPlacar}>XP</Text>
        </View>
        <View style={e.itemPlacar}>
          <Text style={[e.valorPlacar, { color: cores.laranja }]}>{resultado?.ofensiva.streak ?? '—'}</Text>
          <Text style={e.rotuloPlacar}>Ofensiva</Text>
        </View>
        <View style={e.itemPlacar}>
          <Text style={[e.valorPlacar, { color: cores.verde }]}>{percentual}%</Text>
          <Text style={e.rotuloPlacar}>Acertos</Text>
        </View>
      </View>

      <Text style={e.detalheFim}>
        {acertos} de {total} questões
      </Text>

      {!resultado && (
        <Text style={e.semRede}>
          Não consegui registrar no servidor — a ofensiva e o XP deste tema não contaram. Confira a
          conexão e refaça quando puder.
        </Text>
      )}

      {resultado && resultado.erros.length > 0 && (
        <View style={e.conceitos}>
          <Text style={e.conceitosTitulo}>Vale revisar</Text>
          <Text style={e.conceitosTexto}>
            {[...new Set(resultado.erros.flatMap((x) => x.tags))].slice(0, 6).join(' · ') ||
              'Refaça as questões que você errou.'}
          </Text>
        </View>
      )}

      <Botao titulo="Voltar para a matéria" aoTocar={aoSair} estilo={{ marginTop: espaco.xl }} />
    </ScrollView>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaco.xl },
  carregando: { fontWeight: '800', fontSize: tamanho.corpo, color: cores.textoFraco },
  topo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, paddingHorizontal: espaco.lg, paddingVertical: espaco.md },
  fechar: { fontSize: tamanho.h2, color: cores.textoFraco, fontWeight: '800' },
  corpoQuestao: { paddingHorizontal: espaco.lg + 2, paddingTop: espaco.md, paddingBottom: espaco.xxl },
  tipo: {
    fontWeight: '800',
    fontSize: tamanho.mini + 1,
    color: cores.textoFraco,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: espaco.md,
  },
  rodape: {
    padding: espaco.lg,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    backgroundColor: cores.fundo,
  },
  tituloRetorno: { fontWeight: '800', fontSize: tamanho.h3 - 2, marginBottom: 4 },
  explicacao: { fontWeight: '700', fontSize: tamanho.pequeno + 0.5, lineHeight: 20, color: cores.texto },
  corpoAula: { paddingHorizontal: espaco.lg + 2, paddingBottom: espaco.xxl },
  migalha: { fontWeight: '800', fontSize: tamanho.mini, color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5 },
  tituloAula: { fontWeight: '800', fontSize: tamanho.h2, color: cores.laranja, marginTop: espaco.sm, marginBottom: espaco.md },
  textoAula: { fontWeight: '700', fontSize: tamanho.corpo + 1, lineHeight: 27, color: cores.texto },
  pontoResumo: { flexDirection: 'row', gap: espaco.md, alignItems: 'flex-start', marginBottom: espaco.md },
  marcador: { width: 9, height: 9, borderRadius: 5, backgroundColor: cores.laranja, marginTop: 8 },
  textoResumo: { flex: 1, fontWeight: '700', fontSize: tamanho.corpo, lineHeight: 24, color: cores.texto },
  botaoNota: { alignSelf: 'flex-start', marginTop: espaco.xl, paddingVertical: espaco.sm, paddingHorizontal: espaco.md + 2, borderRadius: raio.pilula, backgroundColor: cores.creme },
  botaoNotaTexto: { fontWeight: '800', fontSize: tamanho.pequeno, color: cores.laranja },
  caixaNota: { marginTop: espaco.xl, gap: espaco.md },
  entradaNota: {
    borderWidth: 2,
    borderColor: cores.borda,
    borderRadius: raio.md,
    padding: espaco.md,
    minHeight: 90,
    fontWeight: '700',
    fontSize: tamanho.pequeno + 1,
    color: cores.texto,
    backgroundColor: cores.card,
    textAlignVertical: 'top',
  },
  corpoFim: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: espaco.xl },
  emoji: { fontSize: 56 },
  numeroOfensiva: { fontWeight: '800', fontSize: 58, color: cores.laranja },
  tituloFim: { fontWeight: '800', fontSize: tamanho.h2, color: cores.texto, marginTop: espaco.sm, textAlign: 'center' },
  placar: { flexDirection: 'row', gap: espaco.sm + 2, marginTop: espaco.xl },
  itemPlacar: {
    backgroundColor: cores.card,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md + 2,
    paddingVertical: espaco.md + 2,
    paddingHorizontal: espaco.lg,
    alignItems: 'center',
    minWidth: 92,
  },
  valorPlacar: { fontWeight: '800', fontSize: tamanho.h2 },
  rotuloPlacar: { fontSize: tamanho.mini - 1, color: cores.textoFraco, fontWeight: '800', textTransform: 'uppercase', marginTop: 3 },
  detalheFim: { color: cores.textoFraco, fontWeight: '700', fontSize: tamanho.pequeno + 1, marginTop: espaco.lg },
  semRede: {
    color: cores.vermelho,
    backgroundColor: cores.vermelhoFundo,
    borderRadius: raio.md,
    padding: espaco.md + 2,
    fontWeight: '700',
    fontSize: tamanho.pequeno,
    lineHeight: 19,
    marginTop: espaco.lg,
    textAlign: 'center',
  },
  conceitos: { marginTop: espaco.xl, backgroundColor: cores.creme, borderRadius: raio.md + 2, padding: espaco.lg, width: '100%' },
  conceitosTitulo: { fontWeight: '800', fontSize: tamanho.pequeno + 1, color: cores.texto, marginBottom: 6 },
  conceitosTexto: { fontWeight: '700', fontSize: tamanho.pequeno, color: cores.textoFraco, lineHeight: 20 },
});
