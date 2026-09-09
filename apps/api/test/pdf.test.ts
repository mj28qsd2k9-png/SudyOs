import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErroPdf, extrairTextoDoPdf, pareceePdf } from '../src/material/pdf.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(aqui, 'fixtures');
const PDF = path.join(FIXTURES, 'apostila.pdf');

/**
 * O PDF de teste e gerado uma vez e versionado. Testar extracao com um PDF de
 * mentira (bytes montados a mao) nao vale nada: o que se quer saber e se o
 * parser aguenta um arquivo de verdade, com fontes, paginas e quebras.
 */
describe('extracao de PDF', () => {
  let dados: Uint8Array;

  beforeAll(() => {
    expect(existsSync(PDF), `fixture ausente: ${PDF}`).toBe(true);
    dados = new Uint8Array(readFileSync(PDF));
  });

  it('reconhece a assinatura do formato', () => {
    expect(pareceePdf(dados)).toBe(true);
    expect(pareceePdf(new Uint8Array(Buffer.from('%PDX-1.4')))).toBe(false);
    expect(pareceePdf(new Uint8Array([0x25]))).toBe(false);
  });

  it('extrai o texto inteiro de um PDF de varias paginas', async () => {
    const r = await extrairTextoDoPdf(dados);
    expect(r.paginas).toBeGreaterThan(1);
    expect(r.texto.length).toBeGreaterThan(5000);
    // Primeira e ultima unidade: prova que nao parou na primeira pagina.
    expect(r.texto).toContain('MODELO RELACIONAL');
    expect(r.texto).toContain('INDICES E DESEMPENHO');
    // Sem quebras de linha nem espacos duplicados.
    expect(r.texto).not.toMatch(/\s{2,}/);
  });

  it('recusa arquivo que nao e PDF', async () => {
    const txt = new Uint8Array(Buffer.from('a'.repeat(500)));
    await expect(extrairTextoDoPdf(txt)).rejects.toMatchObject({ codigo: 'nao_e_pdf' });
  });

  it('recusa arquivo grande demais antes de tentar abrir', async () => {
    const enorme = new Uint8Array(26 * 1024 * 1024);
    enorme.set([0x25, 0x50, 0x44, 0x46]);
    await expect(extrairTextoDoPdf(enorme)).rejects.toMatchObject({ codigo: 'pdf_grande' });
  });

  it('recusa PDF corrompido com mensagem util', async () => {
    const quebrado = new Uint8Array(Buffer.from('%PDF-1.4\nlixo que nao e um pdf de verdade'));
    await expect(extrairTextoDoPdf(quebrado)).rejects.toBeInstanceOf(ErroPdf);
  });
});
