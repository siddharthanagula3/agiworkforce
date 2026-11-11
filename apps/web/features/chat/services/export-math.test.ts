import JSZip from 'jszip';
import { Document, Math as DocxMath, Packer, Paragraph } from 'docx';
import { describe, expect, it } from 'vitest';

import { texToDocxMath, texToLinearMath } from './export-math';

async function documentXml(tex: string, displayMode: boolean): Promise<string> {
  const [row] = texToDocxMath(tex, displayMode);
  const document = new Document({
    sections: [
      { children: [new Paragraph({ children: [new DocxMath({ children: row ?? [] })] })] },
    ],
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(document));
  return zip.file('word/document.xml')!.async('string');
}

function linear(tex: string, displayMode: boolean): string {
  return texToLinearMath(tex, displayMode)
    .map((row) => row.map((entry) => entry.text).join(''))
    .join('\n');
}

describe('binomial coefficients in document export', () => {
  it.each([
    ['\\binom{5}{2}', false],
    ['\\binom{5}{2}', true],
    ['\\dbinom{5}{2}', false],
    ['\\tbinom{5}{2}', false],
  ])('keeps %s as a no-bar stack in Word (display %s)', async (tex, displayMode) => {
    const xml = await documentXml(tex, displayMode);
    expect(xml).toMatch(/<m:type m:val="noBar"\/>/);
  });

  it('keeps an ordinary fraction barred in Word', async () => {
    const xml = await documentXml('\\frac{5}{2}', false);
    expect(xml).toContain('<m:f>');
    expect(xml).not.toContain('noBar');
  });

  it.each([
    ['\\binom{5}{2}=10', false],
    ['\\binom{5}{2}=10', true],
    ['\\dbinom{5}{2}=10', false],
    ['\\tbinom{5}{2}=10', false],
  ])('does not turn %s into division in PDF (display %s)', (tex, displayMode) => {
    const text = linear(tex, displayMode);
    expect(text).toBe('(5 choose 2) = 10');
    expect(text).not.toContain('/');
  });

  it('keeps an ordinary fraction as division in PDF', () => {
    expect(linear('\\frac{5}{2}', false)).toBe('5/2');
  });

  it('falls back to the raw TeX for malformed input in both adapters', async () => {
    expect(linear('\\binom{5', false)).toBe('\\binom{5');
    expect(await documentXml('\\binom{5', false)).toContain('\\binom{5');
  });
});
