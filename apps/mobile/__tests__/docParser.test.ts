jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 4096 }),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

import { readAsStringAsync } from 'expo-file-system/legacy';

import { DocParseError, parseDocument } from '../services/docParser';

const readMock = readAsStringAsync as jest.MockedFunction<typeof readAsStringAsync>;

const PDF_PARSE_BUDGET_MS = 3_000;

function stagePdf(body: string): void {
  readMock.mockReset();
  readMock.mockResolvedValue(btoa(body) as never);
}

async function parsePdfText(body: string): Promise<string> {
  stagePdf(body);
  const parsed = await parseDocument('file:///tmp/attachment.pdf', 'application/pdf');
  return parsed.text;
}

async function timedParse(
  body: string,
): Promise<{ ms: number; error: unknown; text: string | null }> {
  stagePdf(body);
  const startedAt = Date.now();
  try {
    const parsed = await parseDocument('file:///tmp/attachment.pdf', 'application/pdf');
    return { ms: Date.now() - startedAt, error: null, text: parsed.text };
  } catch (err) {
    return { ms: Date.now() - startedAt, error: err, text: null };
  }
}

describe('parseDocument pdf text extraction', () => {
  it('extracts Tj literals and TJ arrays from a well-formed content stream', async () => {
    stagePdf(
      '%PDF-1.4\n1 0 obj\n/Type /Page\nBT\n/F1 12 Tf\n(Hello world) Tj\n[(Frag)-250(mented)] TJ\nET\n',
    );

    const parsed = await parseDocument('file:///tmp/attachment.pdf', 'application/pdf');

    expect(parsed.text).toBe('Hello world Frag mented');
    expect(parsed.metadata.docType).toBe('pdf');
    expect(parsed.metadata.pages).toBe(1);
  });

  it('keeps balanced inner parentheses inside a string literal', async () => {
    await expect(parsePdfText('%PDF-1.4\nBT\n(a (b) c) Tj\nET\n')).resolves.toBe('a (b) c');
  });

  it('resolves backslash escapes inside a string literal', async () => {
    await expect(parsePdfText('%PDF-1.4\nBT\n(a\\)b\\\\c\\nd) Tj\nET\n')).resolves.toBe('a)b\\c d');
  });

  it('confines an unterminated literal to its own text block', async () => {
    await expect(
      parsePdfText('%PDF-1.4\nBT\n(good) Tj ( dangling\nET\nBT\n(after) Tj\nET\n'),
    ).resolves.toBe('good after');
  });

  it('keeps reading TJ arrays after an unmatched array opener', async () => {
    await expect(parsePdfText('%PDF-1.4\nBT\n[ (x) Tj [(y)(z)] TJ\nET\n')).resolves.toBe('x y z');
  });

  it('ignores a bracket span that is not a TJ operand', async () => {
    await expect(parsePdfText('%PDF-1.4\nBT\n[(a)] Td (b) Tj\nET\n')).resolves.toBe('b');
  });

  it('emits only the operand of a text-showing operator', async () => {
    await expect(parsePdfText('%PDF-1.4\nBT\n(orphan)\n(kept) Tj\nET\n')).resolves.toBe('kept');
  });
});

const CRAFTED_PDFS: ReadonlyArray<readonly [string, () => string]> = [
  ['unterminated BT markers', () => `%PDF-1.4\n${'BT'.repeat(300_000)}\n`],
  [
    'unterminated string and array openers',
    () => `%PDF-1.4\nBT\n${'('.repeat(200_000)}${'['.repeat(200_000)}\nET\n`,
  ],
  [
    'closed TJ arrays holding an unterminated string',
    () => `%PDF-1.4\nBT\n${'[(] TJ '.repeat(200_000)}ET\n`,
  ],
  ['interleaved empty text blocks', () => `%PDF-1.4\n${'BTET'.repeat(300_000)}`],
  [
    'deeply nested string literals',
    () => `%PDF-1.4\nBT\n${'('.repeat(200_000)}${')'.repeat(200_000)}\nET\n`,
  ],
  [
    'trailing escapes in an unterminated literal',
    () => `%PDF-1.4\nBT\n(${'\\'.repeat(400_000)}\nET\n`,
  ],
  [
    'whitespace runs behind every /Type marker',
    () => `%PDF-1.4\n${`/Type${' '.repeat(200)}`.repeat(5_000)}`,
  ],
  [
    'empty operands flushed by repeated Tj',
    () => `%PDF-1.4\nBT\n${`${'()'.repeat(50_000)}Tj `.repeat(10)}ET\n`,
  ],
];

describe('parseDocument pdf extraction stays bounded on crafted input', () => {
  for (const [shape, buildBody] of CRAFTED_PDFS) {
    it(`does not hang on ${shape}`, async () => {
      const { ms, error } = await timedParse(buildBody());

      expect(error).toBeInstanceOf(DocParseError);
      expect((error as DocParseError).code).toBe('EMPTY_DOCUMENT');
      expect(ms).toBeLessThan(PDF_PARSE_BUDGET_MS);
    }, 30_000);
  }

  it('caps extracted text so a crafted PDF cannot expand unbounded', async () => {
    const { ms, text } = await timedParse(
      `%PDF-1.4\nBT\n${`(${'A'.repeat(100)}) Tj\n`.repeat(20_000)}ET\n`,
    );

    expect(text).not.toBeNull();
    expect((text as string).length).toBeLessThan(600_000);
    expect(ms).toBeLessThan(PDF_PARSE_BUDGET_MS);
  }, 30_000);
});
