import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  extractPdfAttachmentContent,
  PdfAttachmentUnreadableError,
} from './pdf-attachment-content';

beforeAll(() => {
  GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(tmpdir(), 'pdf-worker-not-in-the-function-bundle.mjs'),
  ).href;
});

function ascii85(data: Buffer): string {
  let encoded = '';
  for (let offset = 0; offset < data.length; offset += 4) {
    const group = data.subarray(offset, offset + 4);
    const padded = Buffer.concat([group, Buffer.alloc(4 - group.length)]);
    let value = padded.readUInt32BE(0);
    if (value === 0 && group.length === 4) {
      encoded += 'z';
      continue;
    }
    const digits: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      digits.unshift(String.fromCharCode((value % 85) + 33));
      value = Math.floor(value / 85);
    }
    encoded += digits.slice(0, group.length + 1).join('');
  }
  return `${encoded}~>`;
}

function reportLabPdf(body: string): Buffer {
  const content = `BT /F1 12 Tf 14.4 TL ET\nBT 1 0 0 1 72 769.8898 Tm (${body}) Tj T* ET`;
  const stream = ascii85(deflateSync(Buffer.from(content, 'latin1')));
  const objects = [
    '<<\n/F1 2 0 R\n>>',
    '<<\n/BaseFont /Helvetica /Encoding /WinAnsiEncoding /Name /F1 /Subtype /Type1 /Type /Font\n>>',
    '<<\n/Contents 7 0 R /MediaBox [ 0 0 595.2756 841.8898 ] /Parent 6 0 R /Resources <<\n/Font 1 0 R /ProcSet [ /PDF /Text /ImageB /ImageC /ImageI ]\n>> /Rotate 0 /Trans <<\n\n>> \n  /Type /Page\n>>',
    '<<\n/PageMode /UseNone /Pages 6 0 R /Type /Catalog\n>>',
    '<<\n/Author (anonymous) /Producer (ReportLab PDF Library - \\(opensource\\)) /Title (untitled) /Trapped /False\n>>',
    '<<\n/Count 1 /Kids [ 3 0 R ] /Type /Pages\n>>',
    `<<\n/Filter [ /ASCII85Decode /FlateDecode ] /Length ${stream.length}\n>>\nstream\n${stream}endstream`,
  ];

  let pdf = '%PDF-1.3\n%\x93\x8c\x8b\x9e ReportLab Generated PDF document\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf +=
    'trailer\n<<\n/ID \n[<45cbff0bdaab62f859be5cc7d22f0136><45cbff0bdaab62f859be5cc7d22f0136>]\n% ReportLab generated PDF document -- digest\n\n' +
    `/Info 5 0 R\n/Root 4 0 R\n/Size ${objects.length + 1}\n>>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

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

  it('reads a ReportLab PDF with an ASCII85 and Flate content stream', async () => {
    const content = await extractPdfAttachmentContent(
      reportLabPdf('The DOT project colour is teal.'),
      'DOT-teal.pdf',
    );

    expect(content.text).toBe('[Page 1]\nThe DOT project colour is teal.');
    expect(content.pageCount).toBe(1);
    expect(content.pageImages).toHaveLength(0);
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(
      extractPdfAttachmentContent(Buffer.from('just some text'), 'notes.pdf'),
    ).rejects.toBeInstanceOf(PdfAttachmentUnreadableError);
  });
});
