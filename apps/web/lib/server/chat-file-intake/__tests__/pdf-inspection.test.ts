// @vitest-environment node
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import type { SecretHandlingMode } from '@agiworkforce/types';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');
type UploadScanModule = typeof import('@/lib/security/upload-scan');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type ClaimedUserScopeDbModule = typeof import('@/lib/server/claimed-user-scope-db');
type PdfAttachmentContentModule = typeof import('@/lib/server/pdf-attachment-content');
type OrganizationPolicyGateModule = typeof import('@/lib/services/organization-policy-gate');
type SecurityAuditModule = typeof import('@/lib/security-audit');

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: vi.fn(),
}));
vi.mock('@/lib/security/upload-scan', async (importOriginal) => {
  const actual = await importOriginal<UploadScanModule>();
  return {
    ...actual,
    scanUploadRangeForCredentials: vi.fn(actual.scanUploadRangeForCredentials),
  };
});
vi.mock('@/lib/server/pdf-attachment-content', async (importOriginal) => {
  const actual = await importOriginal<PdfAttachmentContentModule>();
  return { ...actual, pdfPageText: vi.fn(actual.pdfPageText) };
});
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: vi.fn(() => ({ marker: 'neon' })),
}));
vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => ({
  ...(await importOriginal<ClaimedUserScopeDbModule>()),
  createClaimedUserScopedDb: vi.fn(() => ({ marker: 'scoped' })),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<OrganizationPolicyGateModule>()),
  resolveSecretHandlingPolicy: vi.fn(),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));

import type { ChatFileIntakeRefusalCode } from '@agiworkforce/cloud-contracts';
import { SECRET_PATTERN_RULES } from '@agiworkforce/utils/secret-redaction';
import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  UPLOAD_INSPECTION_BYTES,
  inspectUploadHead,
  scanUploadRangeForCredentials,
} from '@/lib/security/upload-scan';
import {
  buildPdf,
  seededRandom,
  seededWords,
} from '@/lib/server/chat-file-preparation/__tests__/preparation-harness';
import { defaultPreparationStorage } from '@/lib/server/chat-file-preparation/derived-keys';
import { getKeyValueStore } from '@/lib/server/key-value';
import { loadPdfjs, pdfPageText } from '@/lib/server/pdf-attachment-content';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { openPrivateObjectRange, type ChatFileInspectionCursor } from '../full-inspection';
import { createChatFileIntakeDeps, runChatFileIntakeStep, type ChatFileIntakeDeps } from '../steps';
import type { ChatFileIntakeRow } from '../store';
import type { ChatFileIntakeDirective, IntakeObjects } from '../transitions';
import { createFakeScanner, type FakeScanner } from './fake-scanner';
import {
  createIntakeHarness,
  putStagedFile,
  runInline,
  START_MS,
  stubMemoryObjectStorage,
  type IntakeHarness,
} from './inline-executor';
import { intakeRow } from './memory-intake-store';

const actualUploadScan = await vi.importActual<UploadScanModule>('@/lib/security/upload-scan');
const actualPdfContent = await vi.importActual<PdfAttachmentContentModule>(
  '@/lib/server/pdf-attachment-content',
);

const LIVE_KEY = `sk_live_${'EXAMPLE'.repeat(4)}`;
const RECOGNISED_SECRET = `STRIPE_SECRET_KEY=${LIVE_KEY}`;
const PROJECT_KEY = `sk-proj-${'Q7xLm2Vb9RtZa4Yb'.repeat(2)}W3CnH8sJfE6d`;
const SPLIT_AT = RECOGNISED_SECRET.length - 12;
const SSN_SHAPE = '078-05-1120';
const SSN_LABEL = SECRET_PATTERN_RULES['us-ssn'].label;
const FILLER = 'the quick brown fox jumps over the lazy dog\n';
const PDF: Declared = { fileName: 'report.pdf', mimeType: 'application/pdf' };
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PAGES = 250;
const LATE_PAGE = 240;
const MIDDLE_PAGE = 150;
const LINES_PER_PAGE = 30;
const FONT_SIZE = 8;
const LINE_HEIGHT = 8;
const SMALL_STEP = 100_000;
const FIXTURE_WORDS = /harbor|lantern|ember|willow|cobalt|summit|Quarterly|EXAMPLE|STRIPE/;
const SLUG_URL = 'https://www.example.org/investors/risk-management-and-internal-control-framework';
const SLUG_LINES = [
  `Read the framework at ${SLUG_URL}`,
  'Filed under task-force-on-climate-related-financial-disclosures-2026',
];

interface Declared {
  fileName: string;
  mimeType: string;
}

/** A line of a page: one run, or runs set one after another, alternating regular and bold. */
type Line = string | string[];

interface PdfOptions {
  /** Lines of each page; an empty page has no text layer. */
  pages: Line[][];
  compress?: boolean;
  properties?: { title?: string; subject?: string };
  metadata?: string;
  encryption?: { userPassword: string; ownerPassword: string };
}

function pdfDocument(options: PdfOptions): Uint8Array {
  const doc = new jsPDF({
    compress: options.compress ?? true,
    ...(options.encryption
      ? { encryption: { ...options.encryption, userPermissions: ['print' as const] } }
      : {}),
  });
  if (options.properties) doc.setProperties(options.properties);
  if (options.metadata) doc.addMetadata(options.metadata, 'http://example.com/notes/');
  doc.setFontSize(FONT_SIZE);
  options.pages.forEach((lines, index) => {
    if (index > 0) doc.addPage();
    if (lines.length === 0) {
      doc.rect(20, 20, 100, 60);
      return;
    }
    lines.forEach((line, row) => {
      const runs = typeof line === 'string' ? [line] : line;
      let x = 10;
      runs.forEach((run, position) => {
        doc.setFont('helvetica', position % 2 === 0 ? 'normal' : 'bold');
        doc.text(run, x, 12 + row * LINE_HEIGHT);
        x += doc.getTextWidth(run);
      });
    });
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

/** Pages of ordinary prose, with the given lines placed on the given pages. */
function proseDocument(placed: Readonly<Record<number, Line[]>> = {}, pageCount = PAGES) {
  const random = seededRandom(17);
  const pages: Line[][] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const lines: Line[] = [`Quarterly review page ${page}`];
    for (let line = 1; line < LINES_PER_PAGE; line += 1) lines.push(seededWords(random, 9));
    lines.push(...(placed[page] ?? []));
    pages.push(lines);
  }
  return pdfDocument({ pages });
}

async function pageReaderTexts(bytes: Uint8Array, page: number) {
  const { getDocument } = await loadPdfjs();
  const task = getDocument({ data: bytes.slice(), useWorkerFetch: false, verbosity: 0 });
  try {
    const proxy = await (await task.promise).getPage(page);
    return await actualPdfContent.pdfPageText(proxy);
  } finally {
    await task.destroy();
  }
}

/** The PDF is past the head, and the secret in it is nowhere in its stored bytes. */
function expectCompressedPastHead(bytes: Uint8Array, secret: string) {
  expect(bytes.byteLength).toBeGreaterThan(UPLOAD_INSPECTION_BYTES);
  expect(Buffer.from(bytes).includes(Buffer.from(secret))).toBe(false);
}

/** The cross-reference table rebuilt for a PDF whose objects moved. */
function fixXref(pdf: string): string {
  const offsets: number[] = [];
  for (const match of pdf.matchAll(/(?<=\n)(\d+) 0 obj\n/g)) {
    offsets[Number(match[1])] = match.index;
  }
  const xrefAt = pdf.lastIndexOf('xref\n');
  const entries = offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  const trailer = pdf.slice(pdf.indexOf('trailer', xrefAt), pdf.lastIndexOf('startxref'));
  return `${pdf.slice(0, xrefAt)}xref\n0 ${offsets.length}\n0000000000 65535 f \n${entries}${trailer}startxref\n${xrefAt}\n%%EOF\n`;
}

function pdfRow(bytes: Uint8Array, declared: Declared = PDF): ChatFileIntakeRow {
  return intakeRow({
    ...declared,
    byteCount: bytes.byteLength,
    dailyBytesCharged: bytes.byteLength,
    createdAt: START_MS,
    stateChangedAt: START_MS,
  });
}

type ReadHeadSpy = Mock<IntakeObjects['readHead']>;

async function stagedPdf(
  bytes: Uint8Array,
  overrides: Partial<ChatFileIntakeDeps> = {},
  declared: Declared = PDF,
): Promise<{
  row: ChatFileIntakeRow;
  harness: IntakeHarness;
  readHead: ReadHeadSpy;
  scanner: FakeScanner;
}> {
  const base = pdfRow(bytes, declared);
  const staged = await putStagedFile(base, bytes);
  const row = { ...base, declaredSha256: staged.sha256 };
  const scanner = createFakeScanner({
    submit: () => ({ answer: 'submitAccepted' }),
    poll: () => ({
      answer: 'pollDoneClean',
      verdict: { sha256: staged.sha256, bytes: row.byteCount, etag: staged.etag },
    }),
  });
  const harness = createIntakeHarness({ scanner, rows: [row], overrides });
  const readHead = vi.fn(harness.deps.objects.readHead);
  harness.deps.objects = { ...harness.deps.objects, readHead };
  return { row, harness, readHead, scanner };
}

type Outcome = 'refused' | 'accepted';

async function pdfOutcome(
  bytes: Uint8Array,
  overrides: Partial<ChatFileIntakeDeps> = {},
  declared: Declared = PDF,
): Promise<{
  outcome: Outcome;
  refusalCode: ChatFileIntakeRefusalCode | null;
  harness: IntakeHarness;
  directives: ChatFileIntakeDirective[];
  scanner: FakeScanner;
}> {
  const { row, harness, scanner } = await stagedPdf(bytes, overrides, declared);
  const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });
  const ended = harness.store.row(row.id);
  if (ended.state === 'rejected') {
    expect(harness.presignGet).not.toHaveBeenCalled();
    expect(harness.seal.media).toEqual([]);
    return {
      outcome: 'refused',
      refusalCode: ended.refusalCode,
      harness,
      directives: run.directives,
      scanner,
    };
  }
  expect(ended.state).toBe('sealed');
  return {
    outcome: 'accepted',
    refusalCode: null,
    harness,
    directives: run.directives,
    scanner,
  };
}

function policyInspector(mode: SecretHandlingMode): ChatFileIntakeDeps['inspectContent'] {
  vi.mocked(resolveSecretHandlingPolicy).mockResolvedValue({ mode, organizationId: null });
  return createChatFileIntakeDeps({
    version: 1,
    intakeId: intakeRow().id,
    userId: 'user-owner',
    organizationId: null,
  }).inspectContent;
}

/** What the inline path decides for a small text file: the same inspection, then the same data policy. */
async function smallFileOutcome(
  text: string,
  inspectContent: ChatFileIntakeDeps['inspectContent'],
): Promise<Outcome> {
  const bytes = new TextEncoder().encode(`${FILLER.repeat(40)}${text}\n${FILLER.repeat(40)}`);
  const inspection = inspectUploadHead(bytes, 'text/plain', 'notes.txt');
  if (!inspection.ok) return 'refused';
  const row = intakeRow({ fileName: 'notes.txt', mimeType: 'text/plain' });
  const verdict = await inspectContent(row, bytes, inspection.findings);
  return verdict === 'blocked' ? 'refused' : 'accepted';
}

function withPolicy(
  text: Partial<(typeof CHAT_LARGE_FILE_POLICY)['kinds']['text']>,
  pdf: Partial<(typeof CHAT_LARGE_FILE_POLICY)['kinds']['pdf']> = {},
): ChatFileIntakeDeps['policy'] {
  return {
    ...CHAT_LARGE_FILE_POLICY,
    kinds: {
      ...CHAT_LARGE_FILE_POLICY.kinds,
      text: { ...CHAT_LARGE_FILE_POLICY.kinds.text, ...text },
      pdf: { ...CHAT_LARGE_FILE_POLICY.kinds.pdf, ...pdf },
    },
  };
}

function cursorsOf(directives: readonly ChatFileIntakeDirective[]): ChatFileInspectionCursor[] {
  return directives
    .map((directive) => (directive.next === 'inspect' ? directive.cursor : undefined))
    .filter((cursor): cursor is ChatFileInspectionCursor => cursor !== undefined);
}

/** Runs the inspection a step at a time, handing back what each step returned and the pages it read. */
async function stepUntilDone(
  harness: IntakeHarness,
  row: ChatFileIntakeRow,
  failOnce?: (directive: ChatFileIntakeDirective) => boolean,
): Promise<{ directives: ChatFileIntakeDirective[]; pagesPerStep: number[] }> {
  const directives: ChatFileIntakeDirective[] = [];
  const pagesPerStep: number[] = [];
  let directive: ChatFileIntakeDirective = { next: 'start' };
  let failed = false;
  while (directive.next === 'start' || directive.next === 'inspect') {
    const failing = !failed && failOnce?.(directive) === true;
    vi.mocked(pdfPageText).mockClear();
    try {
      directive = await runChatFileIntakeStep(
        harness.deps,
        { intakeId: row.id, runId: 'run-1' },
        directive,
      );
      directives.push(directive);
      pagesPerStep.push(vi.mocked(pdfPageText).mock.calls.length);
    } catch (error) {
      if (!failing) throw error;
      failed = true;
    }
  }
  return { directives, pagesPerStep };
}

beforeEach(() => {
  stubMemoryObjectStorage();
  vi.mocked(getKeyValueStore).mockReturnValue(createMemoryKeyValueStore());
  vi.mocked(scanUploadRangeForCredentials).mockImplementation(
    actualUploadScan.scanUploadRangeForCredentials,
  );
  vi.mocked(pdfPageText).mockImplementation(actualPdfContent.pdfPageText);
  vi.mocked(recordAuditEvent).mockClear();
});

describe('the credential scan of a large PDF', () => {
  it.each(['block', 'redact', 'warn'] as const)(
    'gives a credential in the text of a late page the verdict a small text file gets, under a %s policy',
    { timeout: 60_000 },
    async (mode) => {
      const inspectContent = policyInspector(mode);
      for (const [secret, expected] of [
        [RECOGNISED_SECRET, 'refused'],
        [PROJECT_KEY, mode === 'warn' ? 'accepted' : 'refused'],
      ] as const) {
        stubMemoryObjectStorage();
        vi.mocked(recordAuditEvent).mockClear();
        const bytes = proseDocument({ [LATE_PAGE]: [`Deploy with ${secret}`] });
        expectCompressedPastHead(bytes, secret);
        expect(await pageReaderTexts(bytes, LATE_PAGE)).toContain(secret);

        const small = await smallFileOutcome(secret, inspectContent);
        const large = await pdfOutcome(bytes, { inspectContent });

        expect(small).toBe(expected);
        expect(large.outcome).toBe(small);
        if (large.outcome === 'refused') {
          expect(large.refusalCode).toBe('dlp_blocked');
        } else {
          expect(recordAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              eventType: 'secret_detected',
              detail: expect.objectContaining({ source: 'upload_scan:credential_material' }),
            }),
          );
        }
      }
    },
  );

  it('seals a clean PDF, reading its bytes from the first to the last and every page once', async () => {
    const bytes = proseDocument();
    const openRange = vi.fn(openPrivateObjectRange);
    const result = await pdfOutcome(bytes, { openRange });

    expect(result.outcome).toBe('accepted');
    expect(result.harness.seal.media).toHaveLength(1);
    expect(result.harness.presignGet).toHaveBeenCalledTimes(1);
    const ranges = openRange.mock.calls.map(([, start, end]) => [start, end]);
    expect(ranges[0]![0]).toBe(0);
    expect(ranges.at(-1)![1]).toBe(bytes.byteLength);
    const pages = vi.mocked(pdfPageText).mock.calls.length;
    expect(pages).toBe(PAGES);
  });
});

describe('a credential the PDF splits where the reader joins it with a space', () => {
  it('is found across two adjacent runs set in different fonts', async () => {
    const bytes = proseDocument({
      [LATE_PAGE]: [[RECOGNISED_SECRET.slice(0, SPLIT_AT), RECOGNISED_SECRET.slice(SPLIT_AT)]],
    });
    expectCompressedPastHead(bytes, LIVE_KEY);
    const read = await pageReaderTexts(bytes, LATE_PAGE);
    expect(read).toContain(
      `${RECOGNISED_SECRET.slice(0, SPLIT_AT)} ${RECOGNISED_SECRET.slice(SPLIT_AT)}`,
    );
    expect(read).not.toContain(LIVE_KEY);

    const result = await pdfOutcome(bytes, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('a credential the PDF wraps at its own hyphen', () => {
  it('is found across the line break, which the reader turns into a space', async () => {
    const wrapped = PROJECT_KEY.slice(0, PROJECT_KEY.indexOf('-', 3) + 1);
    const rest = PROJECT_KEY.slice(wrapped.length);
    const bytes = proseDocument({ [LATE_PAGE]: [`OPENAI_API_KEY=${wrapped}`, rest] });
    expectCompressedPastHead(bytes, rest);
    const read = await pageReaderTexts(bytes, LATE_PAGE);
    expect(read).toContain(`${wrapped} ${rest}`);
    expect(read).not.toContain(PROJECT_KEY);
    const inspectContent = policyInspector('block');
    expect(await smallFileOutcome(`OPENAI_API_KEY=${PROJECT_KEY}`, inspectContent)).toBe('refused');

    const result = await pdfOutcome(bytes, { inspectContent });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('the bytes of a PDF that no page shows', () => {
  it('refuses a recognised secret in the information dictionary under every policy', async () => {
    const bytes = pdfDocument({
      pages: [['Quarterly review']],
      properties: { title: 'Quarterly review', subject: RECOGNISED_SECRET },
    });
    expect(Buffer.from(bytes).includes(Buffer.from(LIVE_KEY))).toBe(true);
    expect(await pageReaderTexts(bytes, 1)).not.toContain(LIVE_KEY);

    const result = await pdfOutcome(bytes, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('refuses a recognised secret in an outline title, which preparation keeps with the card', async () => {
    const pdf = buildPdf({
      pages: ['Opening summary text', 'Closing remarks text'],
      outline: [{ title: `Deploy ${RECOGNISED_SECRET.slice(0, SPLIT_AT)}`, page: 2 }],
    });
    const stored = pdf.toString('latin1');
    const split = stored.replace(
      `(Deploy ${RECOGNISED_SECRET.slice(0, SPLIT_AT)})`,
      `<${Buffer.from(`Deploy ${RECOGNISED_SECRET}`, 'latin1').toString('hex')}>`,
    );
    expect(split).not.toBe(stored);
    const bytes = new Uint8Array(Buffer.from(fixXref(split), 'latin1'));
    expect(Buffer.from(bytes).includes(Buffer.from(LIVE_KEY))).toBe(false);

    const result = await pdfOutcome(bytes, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('refuses a recognised secret in an uncompressed metadata stream under every policy', async () => {
    const bytes = pdfDocument({
      pages: [['Quarterly review']],
      metadata: `<notes:deploy>${RECOGNISED_SECRET}</notes:deploy>`,
    });
    const stored = Buffer.from(bytes).toString('latin1');
    expect(stored).toMatch(/\/Type \/Metadata[\s\S]*stream[\s\S]*sk_live_/);
    expect(await pageReaderTexts(bytes, 1)).not.toContain(LIVE_KEY);

    const result = await pdfOutcome(bytes, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('ordinary PDFs under the default organisation policy', () => {
  const NUMBERS = [
    'Invoice INV-2026-000471 card on file 4111 1111 1111 1111 reference 4532015112830366',
    'Order 5555555555554444 tax id 078-05-1120 batch 9781234567897012',
    'Ledger 1.4142135623730951 2.4494897427831779 12.345678901234567 5.5267857142857144',
    'Tracking reference Xk7pQ2vLm9RtZa4YbW3CnH8sJfE6dU1gOiPy5N0qBx',
  ];

  it.each(['redact', 'block'] as const)(
    'seals a PDF full of long numbers, card-shaped strings and decimals, under a %s policy',
    async (mode) => {
      const table = Array.from({ length: 12 }, () => NUMBERS).flat();
      for (const line of NUMBERS) {
        expect([line, await smallFileOutcome(line, policyInspector(mode))]).toEqual([
          line,
          'refused',
        ]);
      }
      const bytes = pdfDocument({ pages: [table, table, table], compress: false });
      expect(Buffer.from(bytes).toString('latin1')).toContain('4111 1111 1111 1111');

      const result = await pdfOutcome(bytes, { inspectContent: policyInspector(mode) });

      expect(result.outcome).toBe('accepted');
    },
  );

  it.each(['redact', 'block'] as const)(
    'seals a PDF that prints and links a URL whose slug runs on from a word ending in sk, under a %s policy',
    async (mode) => {
      for (const line of SLUG_LINES) {
        expect([line, await smallFileOutcome(line, policyInspector(mode))]).toEqual([
          line,
          'refused',
        ]);
      }
      const doc = new jsPDF({ compress: false });
      doc.setFontSize(FONT_SIZE);
      SLUG_LINES.forEach((line, row) => doc.text(line, 10, 12 + row * LINE_HEIGHT));
      doc.link(10, 40, 120, 8, { url: SLUG_URL });
      const bytes = new Uint8Array(doc.output('arraybuffer'));
      expect(Buffer.from(bytes).toString('latin1')).toContain(`/URI (${SLUG_URL})`);
      expect(await pageReaderTexts(bytes, 1)).toContain(SLUG_URL);

      const result = await pdfOutcome(bytes, { inspectContent: policyInspector(mode) });

      expect(result.outcome).toBe('accepted');
    },
  );

  it('seals a PDF with no text layer', async () => {
    const bytes = pdfDocument({ pages: [[], [], []] });
    expect(await pageReaderTexts(bytes, 2)).toBe('');

    const result = await pdfOutcome(bytes, { inspectContent: policyInspector('block') });

    expect(result.outcome).toBe('accepted');
  });

  it('seals a PDF the reader opens only by rebuilding its cross-reference table', async () => {
    const pdf = buildPdf({ pages: ['Opening summary text', 'Closing remarks text'] });
    const text = pdf.toString('latin1');
    const startxref = /startxref\n(\d+)/.exec(text)!;
    const damaged = Buffer.from(
      text.replace(startxref[0], `startxref\n${Number(startxref[1]) + 37}`),
      'latin1',
    );
    expect(await pageReaderTexts(new Uint8Array(damaged), 2)).toBe('Closing remarks text');

    const result = await pdfOutcome(new Uint8Array(damaged));

    expect(result.outcome).toBe('accepted');
  });

  it('reads and seals a PDF with only an owner password, which opens without one', async () => {
    const bytes = pdfDocument({
      pages: [['Quarterly review']],
      encryption: { userPassword: '', ownerPassword: 'owner-only' },
    });

    expect((await pdfOutcome(bytes)).outcome).toBe('accepted');
    stubMemoryObjectStorage();
    const withSecret = pdfDocument({
      pages: [['Quarterly review', RECOGNISED_SECRET]],
      encryption: { userPassword: '', ownerPassword: 'owner-only' },
    });
    expect(Buffer.from(withSecret).includes(Buffer.from(LIVE_KEY))).toBe(false);
    expect((await pdfOutcome(withSecret)).refusalCode).toBe('dlp_blocked');
  });
});

describe('a PDF the scan cannot read to its end', () => {
  it.each(['block', 'warn'] as const)(
    'refuses a password protected PDF as encrypted, under a %s policy',
    async (mode) => {
      const bytes = pdfDocument({
        pages: [['Quarterly review']],
        encryption: { userPassword: 'user-password', ownerPassword: 'owner-password' },
      });

      const result = await pdfOutcome(bytes, { inspectContent: policyInspector(mode) });

      expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'encrypted' });
    },
  );

  it('refuses a file named and declared a PDF that pdf.js cannot open as not the type it was declared', async () => {
    const bytes = new Uint8Array(
      Buffer.concat([
        Buffer.from('%PDF-1.7\n'),
        Buffer.alloc(300_000, 0x0a),
        Buffer.from('trailer garbage %%EOF'),
      ]),
    );

    const result = await pdfOutcome(bytes);

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'type_mismatch' });
  });

  it('refuses a PDF with more pages than the scan may read as over the limits', async () => {
    const bytes = pdfDocument({ pages: [['One'], ['Two'], ['Three'], ['Four']] });

    const result = await pdfOutcome(bytes, { policy: withPolicy({}, { maxScanPages: 3 }) });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'limits_exceeded' });
  });
});

describe('the steps of the PDF scan', () => {
  it('reads every page past the pages preparation hands to a model', async () => {
    const bytes = proseDocument({ 12: [RECOGNISED_SECRET] }, 14);

    const result = await pdfOutcome(bytes, {
      policy: withPolicy({}, { maxTextPages: 5, pagesPerStep: 5 }),
    });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('reads at most a step of pages and a text step of bytes per step, and its cursor holds no text', async () => {
    const bytes = proseDocument({ [MIDDLE_PAGE]: [PROJECT_KEY] });
    const { row, harness } = await stagedPdf(bytes, {
      policy: withPolicy({ bytesPerStep: SMALL_STEP }),
      inspectContent: policyInspector('warn'),
    });

    const { directives, pagesPerStep } = await stepUntilDone(harness, row);

    expect(directives.at(-1)).toEqual({ next: 'submit' });
    const { pagesPerStep: limit } = CHAT_LARGE_FILE_POLICY.kinds.pdf;
    expect(Math.max(...pagesPerStep)).toBeLessThanOrEqual(limit);
    expect(pagesPerStep.reduce((total, pages) => total + pages, 0)).toBe(PAGES);
    expect(pagesPerStep.filter((pages) => pages > 0)).toEqual([limit, limit, PAGES - 2 * limit]);
    const cursors = cursorsOf(directives);
    expect(cursors.length).toBe(Math.ceil(bytes.byteLength / SMALL_STEP) + 1);
    const owned = vi
      .mocked(scanUploadRangeForCredentials)
      .mock.calls.map(([window]) => window.byteLength);
    expect(Math.max(...owned)).toBeLessThanOrEqual(UPLOAD_INSPECTION_BYTES);
    expect(cursors.at(-1)).toMatchObject({ scan: 'pdf', findings: [expect.anything()] });
    for (const cursor of cursors) {
      const serialised = JSON.stringify(cursor);
      expect(serialised).not.toMatch(FIXTURE_WORDS);
      expect(serialised).not.toContain(PROJECT_KEY.slice(8, 24));
    }
  });

  it('scans the same bytes and pages again on a retry, so nothing is skipped or counted twice', async () => {
    const bytes = proseDocument({ [LATE_PAGE]: [PROJECT_KEY] });
    const policy = withPolicy({ bytesPerStep: SMALL_STEP });
    const inspectContent = policyInspector('warn');
    const clean = await stagedPdf(bytes, { policy, inspectContent });
    const expected = await stepUntilDone(clean.harness, clean.row);
    expect(expected.directives.at(-1)).toEqual({ next: 'submit' });

    for (const phase of ['bytes', 'pages'] as const) {
      stubMemoryObjectStorage();
      let shortReads = 0;
      const openRange = vi.fn(async (key: string, start: number, end: number) => {
        const stream = await openPrivateObjectRange(key, start, end);
        if (shortReads === 0 || !stream) return stream;
        shortReads -= 1;
        return null;
      });
      let storageFailures = 0;
      const preparationStorage = () => {
        if (storageFailures === 0) return defaultPreparationStorage();
        storageFailures -= 1;
        throw new Error('storage unavailable');
      };
      const retried = await stagedPdf(bytes, {
        policy,
        inspectContent,
        openRange,
        preparationStorage,
      });
      let armed = false;
      const outcome = await stepUntilDone(retried.harness, retried.row, (directive) => {
        if (armed || directive.next !== 'inspect' || directive.cursor?.scan !== 'pdf') return false;
        const inPages = directive.cursor.ownedFrom === bytes.byteLength;
        if (phase === 'bytes' ? inPages || directive.cursor.ownedFrom === 0 : !inPages) {
          return false;
        }
        armed = true;
        if (phase === 'bytes') shortReads = 1;
        else storageFailures = 1;
        return true;
      });

      expect(armed).toBe(true);
      expect(outcome.directives).toEqual(expected.directives);
    }
  });

  it('refuses changed_during_check when the object changes between steps', async () => {
    const bytes = proseDocument();
    const { row, harness } = await stagedPdf(bytes, {
      policy: withPolicy({ bytesPerStep: SMALL_STEP }),
    });
    let heads = 0;
    const objects = harness.deps.objects;
    harness.deps.objects = {
      ...objects,
      head: async (key) => {
        const head = await objects.head(key);
        heads += 1;
        return heads > 4 && head ? { ...head, etag: '"replaced"' } : head;
      },
    };

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });

    expect(run.last).toEqual({ next: 'end', reason: 'rejected' });
    expect(harness.store.row(row.id).refusalCode).toBe('changed_during_check');
    expect(run.directives.some((directive) => directive.next === 'submit')).toBe(false);
    const inspected = cursorsOf(run.directives);
    expect(inspected.length).toBeGreaterThanOrEqual(2);
    expect(inspected.at(-1)).toMatchObject({ scan: 'pdf' });
    expect(harness.presignGet).not.toHaveBeenCalled();
    expect(harness.seal.media).toEqual([]);
  });

  it('starts no further page once a third of the inspecting lease has gone, and still reads every page', async () => {
    const pageCount = 6;
    const bytes = proseDocument({}, pageCount);
    let clock = START_MS;
    const { row, harness } = await stagedPdf(bytes, {
      now: () => (clock += CHAT_LARGE_FILE_POLICY.intake.leaseMs.inspecting / 3),
    });

    const { directives, pagesPerStep } = await stepUntilDone(harness, row);

    expect(directives.at(-1)).toEqual({ next: 'submit' });
    expect(pagesPerStep.filter((pages) => pages > 0)).toEqual(Array(pageCount).fill(1));
  });

  it('refuses a PDF whose scan runs past its total time as over the limits, each step inside its share of the lease', async () => {
    const pageCount = 14;
    const pagesPerStep = 2;
    const tickMs = 1_000;
    const bytes = proseDocument({}, pageCount);
    const scanned = async (pdf: Partial<(typeof CHAT_LARGE_FILE_POLICY)['kinds']['pdf']>) => {
      stubMemoryObjectStorage();
      let clock = START_MS;
      const { row, harness } = await stagedPdf(bytes, {
        policy: withPolicy({}, { pagesPerStep, ...pdf }),
        now: () => (clock += tickMs),
      });
      return { row, harness, ...(await stepUntilDone(harness, row)) };
    };

    const whole = await scanned({});
    expect(whole.directives.at(-1)).toEqual({ next: 'submit' });

    const bounded = await scanned({ maxScanMs: 5 * tickMs });

    expect(bounded.directives.at(-1)).toEqual({ next: 'end', reason: 'rejected' });
    expect(bounded.harness.store.row(bounded.row.id).refusalCode).toBe('limits_exceeded');
    expect(bounded.harness.presignGet).not.toHaveBeenCalled();
    expect(bounded.harness.seal.media).toEqual([]);
    const pagesRead = bounded.pagesPerStep.reduce((total, pages) => total + pages, 0);
    expect(pagesRead).toBeGreaterThan(0);
    expect(pagesRead).toBeLessThan(pageCount);
    expect(Math.max(...bounded.pagesPerStep)).toBeLessThanOrEqual(pagesPerStep);
  });

  it('extracts the text of each page once, for both the joins it scans', async () => {
    const pageCount = 14;
    const bytes = proseDocument({}, pageCount);
    const { getDocument } = await loadPdfjs();
    const task = getDocument({ data: bytes.slice(), useWorkerFetch: false, verbosity: 0 });
    const pageProxy = Object.getPrototypeOf(await (await task.promise).getPage(1)) as {
      getTextContent: () => Promise<unknown>;
    };
    await task.destroy();
    const extractions = vi.spyOn(pageProxy, 'getTextContent');
    try {
      const result = await pdfOutcome(bytes);

      expect(result.outcome).toBe('accepted');
      expect(extractions).toHaveBeenCalledTimes(pageCount);
    } finally {
      extractions.mockRestore();
    }
  });

  it('gives the data policy a finding in the head of a PDF declared as text once, and reads its bytes with every detector', async () => {
    const random = seededRandom(23);
    const pages: Line[][] = [[`Deploy with ${PROJECT_KEY}`]];
    for (let page = 0; page < 120; page += 1) {
      pages.push(Array.from({ length: LINES_PER_PAGE }, () => seededWords(random, 9)));
    }
    pages.push([`Employee number ${SSN_SHAPE}`]);
    const bytes = new Uint8Array(
      Buffer.concat([Buffer.from('\n'), pdfDocument({ pages, compress: false })]),
    );
    expect(inspectUploadHead(bytes, 'text/plain', 'report.pdf').ok).toBe(true);
    expect(await pageReaderTexts(bytes, 1)).toContain(PROJECT_KEY);
    expect(Buffer.from(bytes).indexOf(PROJECT_KEY)).toBeLessThan(UPLOAD_INSPECTION_BYTES);
    expect(Buffer.from(bytes).indexOf(SSN_SHAPE)).toBeGreaterThan(UPLOAD_INSPECTION_BYTES);
    const warn = policyInspector('warn');
    const inspectContent = vi.fn(warn);

    const result = await pdfOutcome(
      bytes,
      { inspectContent },
      { fileName: 'report.pdf', mimeType: 'text/plain' },
    );

    expect(result).toMatchObject({ outcome: 'accepted', refusalCode: null });
    expect(cursorsOf(result.directives).some((cursor) => cursor.scan === 'pdf')).toBe(true);
    const findings = inspectContent.mock.calls.at(-1)![2];
    expect(
      findings.filter((finding) => finding.detail.startsWith('Anthropic/OpenAI API Key')),
    ).toHaveLength(1);
    expect(findings.some((finding) => finding.detail.startsWith(SSN_LABEL))).toBe(true);
  });
});

describe('a file whose name and declared type disagree', () => {
  it('reads a DOCX named .pdf as the package its declared type makes it, and seals it', async () => {
    const document = new Document({
      sections: [
        { children: [new Paragraph({ children: [new TextRun({ text: 'Quarterly brief' })] })] },
      ],
    });
    const bytes = new Uint8Array(await Packer.toBuffer(document));

    const result = await pdfOutcome(bytes, {}, { fileName: 'brief.pdf', mimeType: DOCX_TYPE });

    expect(result.outcome).toBe('accepted');
    expect(cursorsOf(result.directives).map((cursor) => cursor.scan)).toEqual(['package']);
    expect(result.scanner.submits().map((call) => call.body?.['mimeType'])).toEqual([DOCX_TYPE]);
  });

  it('reads a package declared as a PDF as a package and then as a PDF, and refuses it when pdf.js cannot open it', async () => {
    const document = new Document({
      sections: [
        { children: [new Paragraph({ children: [new TextRun({ text: 'Quarterly brief' })] })] },
      ],
    });
    const bytes = new Uint8Array(await Packer.toBuffer(document));

    const result = await pdfOutcome(
      bytes,
      {},
      { fileName: 'brief.docx', mimeType: 'application/pdf' },
    );

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'type_mismatch' });
    expect(cursorsOf(result.directives).map((cursor) => cursor.scan)).toEqual(['package', 'pdf']);
  });
});

describe('a PDF a reader opens by its name under another declared type', () => {
  const BY_NAME: Declared = { fileName: 'report.pdf', mimeType: 'text/plain' };

  /** One byte ahead of the header, so no check that reads the first bytes sees a PDF. */
  function behindOneByte(pdf: Uint8Array): Uint8Array {
    return new Uint8Array(Buffer.concat([Buffer.from('\n'), pdf]));
  }

  function scriptedPdf(): Uint8Array {
    const doc = new jsPDF({ compress: false });
    doc.text('Quarterly review', 10, 12);
    doc.addJS('app.alert(1)');
    return behindOneByte(new Uint8Array(doc.output('arraybuffer')));
  }

  it.each([
    ['read as a PDF by its name', BY_NAME],
    ['declared a PDF', PDF],
  ])('is refused for the script it runs on opening when %s', async (_label, declared) => {
    const bytes = scriptedPdf();
    expect(Buffer.from(bytes).includes('/JavaScript')).toBe(true);
    expect(inspectUploadHead(bytes, BY_NAME.mimeType, BY_NAME.fileName).ok).toBe(true);

    const result = await pdfOutcome(bytes, {}, declared);

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'active_pdf' });
    expect(result.scanner.submits()).toEqual([]);
  });

  it('is submitted to the scanner as a PDF, so the scanner checks it for active content too', async () => {
    const bytes = behindOneByte(pdfDocument({ pages: [['Quarterly review']], compress: false }));

    const result = await pdfOutcome(bytes, {}, BY_NAME);

    expect(result.outcome).toBe('accepted');
    expect(result.scanner.submits().map((call) => call.body?.['mimeType'])).toEqual([
      'application/pdf',
    ]);
  });
});
