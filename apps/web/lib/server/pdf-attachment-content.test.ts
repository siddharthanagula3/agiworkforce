import { describe, expect, it } from 'vitest';

import {
  extractPdfAttachmentContent,
  PdfAttachmentUnreadableError,
} from './pdf-attachment-content';

function textPdf(body: string): Buffer {
  const stream = `BT /F1 14 Tf 72 700 Td (${body}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

describe('extractPdfAttachmentContent', () => {
  it('returns the text layer so every route can read the file', async () => {
    const content = await extractPdfAttachmentContent(textPdf('PLUM-VECTOR-9182'), 'report.pdf');

    expect(content.text).toContain('PLUM-VECTOR-9182');
    expect(content.pageImages).toHaveLength(0);
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(
      extractPdfAttachmentContent(Buffer.from('just some text'), 'notes.pdf'),
    ).rejects.toBeInstanceOf(PdfAttachmentUnreadableError);
  });
});
