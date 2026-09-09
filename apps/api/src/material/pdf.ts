import { extractText, getDocumentProxy } from 'unpdf';
import { normalizarMaterial } from './texto.js';

/**
 * Extracao de texto do PDF, no servidor.
 *
 * A primeira versao extraia no cliente com pdf.js, o que fazia sentido enquanto
 * o cliente era uma pagina web. Nao sobrevive ao app: React Native nao tem DOM,
 * e pdf.js depende dele. Como o app e o cliente de verdade, a extracao mudou de
 * lado — e de quebra o backend deixou de depender de um CDN para funcionar.
 */

export const MAX_BYTES_PDF = 25 * 1024 * 1024;

/**
 * Apostila de faculdade passa de 80 paginas com facilidade, e ler mais paginas
 * quase nao custa: a amostra do mapeamento e o trecho de cada tema tem teto
 * proprio, entao o texto extra pesa so na extracao. Quem manda de verdade e o
 * limite de caracteres, la em `texto.ts`.
 */
export const MAX_PAGINAS = 300;

export class ErroPdf extends Error {
  constructor(
    message: string,
    readonly codigo: 'nao_e_pdf' | 'pdf_ilegivel' | 'pdf_sem_texto' | 'pdf_grande',
  ) {
    super(message);
    this.name = 'ErroPdf';
  }
}

/** Assinatura `%PDF-` no inicio do arquivo. */
export function pareceePdf(dados: Uint8Array): boolean {
  return (
    dados.length > 4 &&
    dados[0] === 0x25 &&
    dados[1] === 0x50 &&
    dados[2] === 0x44 &&
    dados[3] === 0x46
  );
}

export type TextoExtraido = {
  texto: string;
  paginas: number;
  paginasLidas: number;
};

export async function extrairTextoDoPdf(dados: Uint8Array): Promise<TextoExtraido> {
  if (dados.length > MAX_BYTES_PDF) {
    throw new ErroPdf('Esse PDF passa de 25 MB. Divida o material em partes.', 'pdf_grande');
  }
  if (!pareceePdf(dados)) {
    throw new ErroPdf('O arquivo enviado nao e um PDF.', 'nao_e_pdf');
  }

  let doc;
  try {
    doc = await getDocumentProxy(dados);
  } catch (erro) {
    throw new ErroPdf(
      'Nao consegui abrir esse PDF. Ele pode estar corrompido ou protegido por senha.',
      'pdf_ilegivel',
    );
  }

  const paginas = doc.numPages;
  const paginasLidas = Math.min(paginas, MAX_PAGINAS);

  const { text } = await extractText(doc, { mergePages: false });
  const paginasTexto = Array.isArray(text) ? text.slice(0, paginasLidas) : [String(text)];
  const texto = normalizarMaterial(paginasTexto.join('\n'));

  // PDF escaneado e imagem: abre, tem paginas, e nao devolve texto nenhum.
  if (texto.length < 200) {
    throw new ErroPdf(
      'Esse PDF quase nao tem texto — provavelmente e escaneado (imagem). ' +
        'Preciso de um PDF com texto de verdade, ou passe o material por um OCR antes.',
      'pdf_sem_texto',
    );
  }

  return { texto, paginas, paginasLidas };
}
