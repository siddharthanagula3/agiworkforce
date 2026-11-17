// @vitest-environment node
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import type { SecretHandlingMode } from '@agiworkforce/types';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');
type UploadScanModule = typeof import('@/lib/security/upload-scan');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type ClaimedUserScopeDbModule = typeof import('@/lib/server/claimed-user-scope-db');
type OfficeDocumentTextModule = typeof import('@/lib/server/office-document-text');
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
vi.mock('@/lib/server/office-document-text', async (importOriginal) => {
  const actual = await importOriginal<OfficeDocumentTextModule>();
  return { ...actual, extractOfficeDocumentText: vi.fn(actual.extractOfficeDocumentText) };
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
import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { MAX_ARCHIVE_MEMBERS } from '@/lib/security/archive-bounds';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  UPLOAD_INSPECTION_BYTES,
  inspectUploadHead,
  scanUploadRangeForCredentials,
} from '@/lib/security/upload-scan';
import { getKeyValueStore } from '@/lib/server/key-value';
import { extractOfficeDocumentText } from '@/lib/server/office-document-text';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { type ChatFileInspectionCursor } from '../full-inspection';
import { createChatFileIntakeDeps, runChatFileIntakeStep, type ChatFileIntakeDeps } from '../steps';
import type { ChatFileIntakeRow } from '../store';
import type { ChatFileIntakeDirective, IntakeObjects } from '../transitions';
import { createFakeScanner } from './fake-scanner';
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

const LIVE_KEY = `sk_live_${'EXAMPLE'.repeat(4)}`;
const RECOGNISED_SECRET = `STRIPE_SECRET_KEY=${LIVE_KEY}`;
const UNRECOGNISED_TOKEN = 'value = "Xk7pQ2vLm9RtZa4YbW3CnH8sJfE6dU1gOiPy5N0qBx"';
const PROJECT_KEY = `sk-proj-${'Q7xLm2Vb9RtZa4Yb'.repeat(2)}W3CnH8sJfE6d`;
const SHARING_LINK =
  'https://contoso.sharepoint.com/:w:/s/Finance/EbXk7pQ2vLm9RtZa4YbW3CnH8sJfE6dU1gOiPy5N0qBx?e=4a2Bc9';
const DOCS_LINK =
  'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
const SPLIT_AT = RECOGNISED_SECRET.length - 12;
const FILLER = 'the quick brown fox jumps over the lazy dog\n';
const MEDIA_BYTES = 300_000;
const SMALL_STEP = 400_000;
const ZIP_LOCAL_HEADER = Uint8Array.of(0x50, 0x4b, 0x03, 0x04);
const CHART_NUMBER = '2.4494897427831779';

const DOCX: Declared = {
  fileName: 'brief.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const XLSX: Declared = {
  fileName: 'ledger.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const PPTX: Declared = {
  fileName: 'deck.pptx',
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const encoder = new TextEncoder();

interface Declared {
  fileName: string;
  mimeType: string;
}

beforeEach(() => {
  stubMemoryObjectStorage();
  vi.mocked(getKeyValueStore).mockReturnValue(createMemoryKeyValueStore());
  vi.mocked(scanUploadRangeForCredentials).mockImplementation(
    actualUploadScan.scanUploadRangeForCredentials,
  );
  vi.mocked(recordAuditEvent).mockClear();
});

/** Incompressible bytes behind a PNG signature, the way a picture sits in a package. */
function mediaBytes(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  let state = 0x9e3779b9;
  for (let index = 0; index < byteCount; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d], 0);
  return bytes;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The package with a picture first, so every part after it starts past the head. */
async function withLeadingMedia(
  archive: Uint8Array | ArrayBuffer,
  extra: Record<string, string | Uint8Array> = {},
  media = MEDIA_BYTES,
): Promise<Uint8Array> {
  const source = await JSZip.loadAsync(archive);
  const zip = new JSZip();
  if (media > 0) zip.file('media/picture.png', mediaBytes(media), { compression: 'STORE' });
  for (const entry of Object.values(source.files)) {
    if (entry.dir) continue;
    zip.file(entry.name, await entry.async('uint8array'));
  }
  for (const [path, body] of Object.entries(extra)) zip.file(path, body);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

async function docxWith(
  paragraphs: string[][],
  extra?: Record<string, string | Uint8Array>,
  media?: number,
) {
  const document = new Document({
    sections: [
      {
        children: paragraphs.map(
          (runs) => new Paragraph({ children: runs.map((text) => new TextRun({ text })) }),
        ),
      },
    ],
  });
  return withLeadingMedia(await Packer.toBuffer(document), extra, media);
}

async function pptxWith(paragraph: string[]): Promise<Uint8Array> {
  const presentation = new PptxGenJS();
  presentation.addSlide().addText(
    paragraph.map((text) => ({ text })),
    { x: 1, y: 1, w: 8, h: 1 },
  );
  const output = await presentation.write({ outputType: 'nodebuffer' });
  return withLeadingMedia(output as Buffer);
}

/**
 * A workbook of one sheet whose rows after the header each hold one shared
 * string, made of the given runs, and the given number in column B, stored at
 * full precision and shown to two decimal places, or in the General format
 * every new cell has. `sheetTail` is markup after the sheet's data.
 */
async function workbookArchive(
  rows: string[][],
  numbers: string[] = [],
  options: { format?: 'rounded' | 'general'; sheetTail?: string } = {},
): Promise<JSZip> {
  const style = options.format === 'general' ? '' : ' s="1"';
  const strings = [['Label'], ...rows].map((runs) =>
    runs.length === 1
      ? `<si><t>${escapeXml(runs[0]!)}</t></si>`
      : `<si>${runs.map((run) => `<r><t>${escapeXml(run)}</t></r>`).join('')}</si>`,
  );
  const sheetRows = strings
    .map((_, index) => {
      const number = numbers[index - 1];
      const valueCell =
        number === undefined ? '' : `<c r="B${index + 1}"${style}><v>${number}</v></c>`;
      return `<row r="${index + 1}"><c r="A${index + 1}" t="s"><v>${index}</v></c>${valueCell}</row>`;
    })
    .join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ledger" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.file(
    'xl/styles.xml',
    '<?xml version="1.0"?><styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="2"/></cellXfs></styleSheet>',
  );
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst>${strings.join('')}</sst>`);
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData>${options.sheetTail ?? ''}</worksheet>`,
  );
  return zip;
}

async function workbookBytes(
  rows: string[][],
  numbers: string[] = [],
  options: { format?: 'rounded' | 'general'; sheetTail?: string } = {},
): Promise<Uint8Array> {
  return (await workbookArchive(rows, numbers, options)).generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
}

async function xlsxWith(
  rows: string[][],
  numbers: string[] = [],
  options: { format?: 'rounded' | 'general'; sheetTail?: string } = {},
): Promise<Uint8Array> {
  return withLeadingMedia(await workbookBytes(rows, numbers, options));
}

async function memberBytes(archive: Uint8Array, path: string): Promise<Uint8Array> {
  const entry = (await JSZip.loadAsync(archive)).file(path);
  if (!entry) throw new Error(`Fixture member missing: ${path}`);
  return entry.async('uint8array');
}

async function memberText(archive: Uint8Array, path: string): Promise<string> {
  return new TextDecoder().decode(await memberBytes(archive, path));
}

/** The member starts past the head and the secret in it is nowhere in the stored bytes. */
async function expectCompressedPastHead(archive: Uint8Array, path: string, text: string) {
  const secret = /[A-Za-z0-9_]{24,}/.exec(text)![0];
  const bytes = Buffer.from(archive);
  expect(bytes.byteLength).toBeGreaterThan(UPLOAD_INSPECTION_BYTES);
  expect(bytes.indexOf(Buffer.from(path))).toBeGreaterThan(UPLOAD_INSPECTION_BYTES);
  expect(bytes.includes(Buffer.from(secret))).toBe(false);
  expect(await memberText(archive, path)).toContain(secret);
}

function packageRow(bytes: Uint8Array, declared: Declared): ChatFileIntakeRow {
  const extension = declared.fileName.slice(declared.fileName.lastIndexOf('.'));
  return intakeRow({
    ...declared,
    byteCount: bytes.byteLength,
    dailyBytesCharged: bytes.byteLength,
    stagingKey: `chat-attachments/user-owner/1731000000000_abc123defgh45${extension}`,
    createdAt: START_MS,
    stateChangedAt: START_MS,
  });
}

type ReadHeadSpy = Mock<IntakeObjects['readHead']>;

async function stagedPackage(
  bytes: Uint8Array,
  declared: Declared,
  overrides: Partial<ChatFileIntakeDeps> = {},
): Promise<{ row: ChatFileIntakeRow; harness: IntakeHarness; readHead: ReadHeadSpy }> {
  const base = packageRow(bytes, declared);
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
  return { row, harness, readHead };
}

type Outcome = 'refused' | 'accepted';

async function packageOutcome(
  bytes: Uint8Array,
  declared: Declared,
  overrides: Partial<ChatFileIntakeDeps> = {},
): Promise<{
  outcome: Outcome;
  refusalCode: ChatFileIntakeRefusalCode | null;
  harness: IntakeHarness;
  readHead: ReadHeadSpy;
  directives: ChatFileIntakeDirective[];
}> {
  const { row, harness, readHead } = await stagedPackage(bytes, declared, overrides);
  const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });
  const ended = harness.store.row(row.id);
  if (ended.state === 'rejected') {
    expect(harness.presignGet).not.toHaveBeenCalled();
    expect(harness.seal.media).toEqual([]);
    return {
      outcome: 'refused',
      refusalCode: ended.refusalCode,
      harness,
      readHead,
      directives: run.directives,
    };
  }
  expect(ended.state).toBe('sealed');
  return { outcome: 'accepted', refusalCode: null, harness, readHead, directives: run.directives };
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
  const bytes = encoder.encode(`${FILLER.repeat(40)}${text}\n${FILLER.repeat(40)}`);
  const inspection = inspectUploadHead(bytes, 'text/plain', 'notes.txt');
  if (!inspection.ok) return 'refused';
  const row = intakeRow({ fileName: 'notes.txt', mimeType: 'text/plain' });
  const verdict = await inspectContent(row, bytes, inspection.findings);
  return verdict === 'blocked' ? 'refused' : 'accepted';
}

function withStep(bytesPerStep: number): ChatFileIntakeDeps['policy'] {
  return {
    ...CHAT_LARGE_FILE_POLICY,
    kinds: {
      ...CHAT_LARGE_FILE_POLICY.kinds,
      text: { ...CHAT_LARGE_FILE_POLICY.kinds.text, bytesPerStep },
    },
  };
}

function cursorsOf(directives: readonly ChatFileIntakeDirective[]): ChatFileInspectionCursor[] {
  return directives
    .map((directive) => (directive.next === 'inspect' ? directive.cursor : undefined))
    .filter((cursor): cursor is ChatFileInspectionCursor => cursor !== undefined);
}

const PACKAGES = [
  {
    label: 'DOCX',
    declared: DOCX,
    member: 'word/document.xml',
    build: (text: string) => docxWith([['Quarterly brief'], [text], ['Prepared for review']]),
  },
  {
    label: 'XLSX',
    declared: XLSX,
    member: 'xl/sharedStrings.xml',
    build: (text: string) => xlsxWith([['Opening balance'], [text], ['Closing balance']]),
  },
  {
    label: 'PPTX',
    declared: PPTX,
    member: 'ppt/slides/slide1.xml',
    build: (text: string) => pptxWith([text]),
  },
];

describe.each(PACKAGES)('the credential scan of a large $label', ({ declared, member, build }) => {
  it.each(['block', 'redact', 'warn'] as const)(
    'gives a credential in a compressed part after the first 256,000 bytes the verdict a small text file gets, under a %s policy',
    async (mode) => {
      const inspectContent = policyInspector(mode);
      for (const [secret, expected] of [
        [RECOGNISED_SECRET, 'refused'],
        [PROJECT_KEY, mode === 'warn' ? 'accepted' : 'refused'],
      ] as const) {
        stubMemoryObjectStorage();
        vi.mocked(recordAuditEvent).mockClear();
        const bytes = await build(secret);
        await expectCompressedPastHead(bytes, member, secret);

        const small = await smallFileOutcome(secret, inspectContent);
        const large = await packageOutcome(bytes, declared, { inspectContent });

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

  it('seals a package whose only credential-like text is a token in no known format, under a block policy', async () => {
    const inspectContent = policyInspector('block');
    const bytes = await build(UNRECOGNISED_TOKEN);
    await expectCompressedPastHead(bytes, member, UNRECOGNISED_TOKEN);
    expect(await smallFileOutcome(UNRECOGNISED_TOKEN, inspectContent)).toBe('refused');

    const result = await packageOutcome(bytes, declared, { inspectContent });

    expect(result.outcome).toBe('accepted');
  });

  it('seals the package when it holds no credential, reading the head, then the whole file once for its members', async () => {
    const bytes = await build('Nothing sensitive is written here.');
    const openRange = vi.fn(async () => null);
    const result = await packageOutcome(bytes, declared, { openRange });

    expect(result.outcome).toBe('accepted');
    expect(result.harness.seal.media).toHaveLength(1);
    expect(result.harness.presignGet).toHaveBeenCalledTimes(1);
    const parts = cursorsOf(result.directives).map((cursor) =>
      cursor.scan === 'package' ? cursor.part : null,
    );
    expect(parts).toEqual([0]);
    expect(result.readHead.mock.calls.map(([, maxBytes]) => maxBytes)).toEqual([
      UPLOAD_INSPECTION_BYTES,
      ...parts.map(() => bytes.byteLength),
    ]);
    expect(openRange).not.toHaveBeenCalled();
  });
});

describe('a credential the package splits where the extracted text joins it', () => {
  it('is found across two Word runs', async () => {
    const bytes = await docxWith([
      ['Quarterly brief'],
      [RECOGNISED_SECRET.slice(0, SPLIT_AT), RECOGNISED_SECRET.slice(SPLIT_AT)],
    ]);
    const xml = await memberText(bytes, 'word/document.xml');
    expect(xml).not.toContain(LIVE_KEY);
    expect(xml).toContain(RECOGNISED_SECRET.slice(SPLIT_AT));

    const { outcome, refusalCode } = await packageOutcome(bytes, DOCX, {
      inspectContent: policyInspector('warn'),
    });

    expect(outcome).toBe('refused');
    expect(refusalCode).toBe('dlp_blocked');
  });

  it('is found across the runs of one shared string', async () => {
    const bytes = await xlsxWith([
      ['Opening balance'],
      [RECOGNISED_SECRET.slice(0, SPLIT_AT), RECOGNISED_SECRET.slice(SPLIT_AT)],
    ]);
    expect(await memberText(bytes, 'xl/sharedStrings.xml')).not.toContain(LIVE_KEY);

    const { outcome, refusalCode } = await packageOutcome(bytes, XLSX, {
      inspectContent: policyInspector('warn'),
    });

    expect(outcome).toBe('refused');
    expect(refusalCode).toBe('dlp_blocked');
  });

  it('is found across two runs of a slide paragraph', async () => {
    const bytes = await pptxWith([
      RECOGNISED_SECRET.slice(0, SPLIT_AT),
      RECOGNISED_SECRET.slice(SPLIT_AT),
    ]);
    expect(await memberText(bytes, 'ppt/slides/slide1.xml')).not.toContain(LIVE_KEY);

    const { outcome } = await packageOutcome(bytes, PPTX, {
      inspectContent: policyInspector('warn'),
    });

    expect(outcome).toBe('refused');
  });
});

describe('the parts of a package that preparation does not read', () => {
  it('refuses a recognised secret in a custom XML part under every policy', async () => {
    const bytes = await docxWith([['Quarterly brief']], {
      'customXml/item1.xml': `<?xml version="1.0"?><settings><deploy>${RECOGNISED_SECRET}</deploy></settings>`,
    });

    const { outcome, refusalCode } = await packageOutcome(bytes, DOCX, {
      inspectContent: policyInspector('warn'),
    });

    expect(outcome).toBe('refused');
    expect(refusalCode).toBe('dlp_blocked');
  });

  it('does not report the hashes and salts Office writes into its own markup', async () => {
    const salt = 'q8Vb3NxR7kLmZ2pT9wYcA1sD4fG6hJ0e';
    const bytes = await docxWith([['Quarterly brief']], {
      'word/settings.xml': `<?xml version="1.0"?><w:settings xmlns:w="w"><w:documentProtection w:edit="readOnly" w:hashValue="Hn3kQ7pXz2Lm9VbRt4YcWa8sJf1dE6gUoPi5N0qBxKl=" w:saltValue="${salt}=="/></w:settings>`,
    });

    const { outcome } = await packageOutcome(bytes, DOCX, {
      inspectContent: policyInspector('block'),
    });

    expect(outcome).toBe('accepted');
  });
});

describe('a package that carries macros', () => {
  const MACROS = { 'word/vbaProject.bin': 'Attribute VB_Name = "Module1"' };

  it('is scanned to its end and sealed, so preparation refuses it with its own reason', async () => {
    const bytes = await docxWith([['Quarterly brief']], MACROS);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('block') });

    expect(result.outcome).toBe('accepted');
  });

  it('is refused when one of its members holds a recognised secret', async () => {
    const bytes = await docxWith([['Quarterly brief']], {
      ...MACROS,
      'customXml/item1.xml': `<?xml version="1.0"?><deploy>${RECOGNISED_SECRET}</deploy>`,
    });

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('the bytes no reader of the package opens', () => {
  it('refuses a recognised secret in the archive comment', async () => {
    const source = await docxWith([['Quarterly brief']]);
    const bytes = new Uint8Array(
      await (
        await JSZip.loadAsync(source)
      ).generateAsync({ type: 'uint8array', compression: 'DEFLATE', comment: RECOGNISED_SECRET }),
    );
    expect(Buffer.from(bytes).indexOf(Buffer.from(LIVE_KEY))).toBeGreaterThan(
      UPLOAD_INSPECTION_BYTES,
    );

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('refuses a recognised secret in a member that starts with a NUL byte', async () => {
    const bytes = await docxWith([['Quarterly brief']], {
      'customXml/item1.xml': `\u0000${FILLER.repeat(400)}${RECOGNISED_SECRET}`,
    });
    expect((await memberText(bytes, 'customXml/item1.xml')).charCodeAt(0)).toBe(0);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe("Office's own serialisation under the default organisation policy", () => {
  const SQUARE_ROOT_OF_TWO = '1.4142135623730951';
  const CHART_VALUE = '2.4494897427831779';
  const COMPUTED_VALUES = ['12.345678901234567', '5.5267857142857144'];
  const SHEET_PROTECTION = '<sheetProtection sheet="1" password="CF7A"/>';
  const USERINFO_LINK = `https://finance@contoso.sharepoint.com/:x:/s/Finance/EbXk7pQ2vLm9RtZa4YbW3CnH8sJfE6dU1gOiPy5N0qBx?e=4a2Bc9`;

  function chartParts(
    workbook: Uint8Array,
    link: string = USERINFO_LINK,
  ): Record<string, string | Uint8Array> {
    return {
      'word/charts/chart1.xml': `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:r="r"><c:chart><c:plotArea><c:barChart><c:ser><c:val><c:numRef><c:f>Sheet1!$B$2</c:f><c:numCache><c:pt idx="0"><c:v>${CHART_VALUE}</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart><c:externalData r:id="rId1"/></c:chartSpace>`,
      'word/charts/_rels/chart1.xml.rels': `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="../embeddings/Microsoft_Excel_Worksheet.xlsx"/><Relationship Id="rId2" Type="hyperlink" Target="${escapeXml(link)}" TargetMode="External"/></Relationships>`,
      'word/embeddings/Microsoft_Excel_Worksheet.xlsx': workbook,
    };
  }

  it.each(['redact', 'block'] as const)(
    'seals a workbook whose numeric cells Office stores at full precision, and whose sheet carries a legacy protection password hash, under a %s policy',
    async (mode) => {
      for (const format of ['rounded', 'general'] as const) {
        stubMemoryObjectStorage();
        const bytes = await xlsxWith(
          [['Opening balance'], ['Closing balance'], ['Forecast'], ['Variance']],
          [SQUARE_ROOT_OF_TWO, CHART_VALUE, ...COMPUTED_VALUES],
          { format, sheetTail: SHEET_PROTECTION },
        );
        const sheet = await memberText(bytes, 'xl/worksheets/sheet1.xml');
        expect(sheet).toContain(`<v>${SQUARE_ROOT_OF_TWO}</v>`);
        expect(sheet.includes(' s="1"')).toBe(format === 'rounded');
        for (const office of [`<v>${SQUARE_ROOT_OF_TWO}</v>`, SHEET_PROTECTION]) {
          expect(await smallFileOutcome(office, policyInspector(mode))).toBe('refused');
        }

        const result = await packageOutcome(bytes, XLSX, { inspectContent: policyInspector(mode) });

        expect(result.outcome).toBe('accepted');
      }
    },
  );

  it.each(['redact', 'block'] as const)(
    'seals a document with a chart, its cached values, a link with a user name in it and its workbook, under a %s policy',
    async (mode) => {
      const workbook = await workbookBytes([['Series']], [SQUARE_ROOT_OF_TWO], {
        format: 'general',
      });
      const bytes = await docxWith([['Quarterly brief']], chartParts(workbook));
      expect(await memberText(bytes, 'word/charts/_rels/chart1.xml.rels')).toContain(
        escapeXml(USERINFO_LINK),
      );
      for (const office of [`<c:v>${CHART_VALUE}</c:v>`, `Target="${USERINFO_LINK}"`]) {
        expect(await smallFileOutcome(office, policyInspector(mode))).toBe('refused');
      }

      const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector(mode) });

      expect(result.outcome).toBe('accepted');
    },
  );

  it.each(['redact', 'block'] as const)(
    'seals a document whose text shows a sharing link and a document link, under a %s policy',
    async (mode) => {
      const line = `See ${SHARING_LINK} and ${DOCS_LINK}`;
      expect(await smallFileOutcome(line, policyInspector(mode))).toBe('refused');
      const bytes = await docxWith([['Quarterly brief'], [line]]);

      const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector(mode) });

      expect(result.outcome).toBe('accepted');
    },
  );

  it.each([
    ['block', 'refused'],
    ['redact', 'refused'],
    ['warn', 'accepted'],
  ] as const)(
    'gives a link that carries a password the verdict a small text file gets, under a %s policy',
    async (mode, expected) => {
      const link = ['https://reports', 'password=Q3review2026@intranet.example.com/q3'].join(':');
      const workbook = await workbookBytes([['Series']]);
      const bytes = await docxWith([['Quarterly brief']], chartParts(workbook, link));
      expect(await smallFileOutcome(`Target="${link}"`, policyInspector(mode))).toBe(expected);

      const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector(mode) });

      expect(result.outcome).toBe(expected);
      if (expected === 'refused') expect(result.refusalCode).toBe('dlp_blocked');
    },
  );
});

describe('a credential in a format that names it but is not certain', () => {
  const header = `<?xml version="1.0"?><w:hdr xmlns:w="w"><w:p><w:r><w:t>Deploy with ${PROJECT_KEY}</w:t></w:r></w:p></w:hdr>`;

  it.each([
    ['block', 'refused'],
    ['warn', 'accepted'],
  ] as const)('in a header no reader opens, under a %s policy, is %s', async (mode, expected) => {
    const bytes = await docxWith([['Quarterly brief']], { 'word/header1.xml': header });
    expect(Buffer.from(bytes).includes(Buffer.from(PROJECT_KEY))).toBe(false);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector(mode) });

    expect(result.outcome).toBe(expected);
    if (expected === 'refused') {
      expect(result.refusalCode).toBe('dlp_blocked');
    } else {
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'secret_detected',
          detail: expect.objectContaining({ source: 'upload_scan:credential_material' }),
        }),
      );
    }
  });

  it('in a cell of the workbook behind a chart is refused under a block policy', async () => {
    const workbook = await workbookBytes([['Deploy'], [PROJECT_KEY]]);
    const bytes = await docxWith([['Quarterly brief']], {
      'word/embeddings/Microsoft_Excel_Worksheet.xlsx': workbook,
    });
    expect(Buffer.from(bytes).includes(Buffer.from(PROJECT_KEY))).toBe(false);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('block') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('a package declared by a text name', () => {
  it("answers to every detector over the package's own bytes, as the text scan after the head would", async () => {
    const source = await JSZip.loadAsync(await docxWith([['Quarterly brief']]));
    const zip = new JSZip();
    zip.file('media/picture.png', mediaBytes(MEDIA_BYTES), { compression: 'STORE' });
    for (const entry of Object.values(source.files)) {
      if (!entry.dir) zip.file(entry.name, await entry.async('uint8array'));
    }
    zip.file('customXml/item1.xml', `<notes>${UNRECOGNISED_TOKEN}</notes>`, {
      compression: 'STORE',
    });
    const bytes = new Uint8Array(
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    );
    const at = Buffer.from(bytes).indexOf(Buffer.from(UNRECOGNISED_TOKEN));
    expect(at).toBeGreaterThan(UPLOAD_INSPECTION_BYTES);
    const declared = { fileName: 'notes.txt', mimeType: DOCX.mimeType };
    expect(await smallFileOutcome(UNRECOGNISED_TOKEN, policyInspector('block'))).toBe('refused');

    const result = await packageOutcome(bytes, declared, {
      inspectContent: policyInspector('block'),
    });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('a package held inside a member', () => {
  const EMBEDDED = 'word/embeddings/Microsoft_Excel_Worksheet.xlsx';

  it('refuses a recognised secret in a cell of a workbook a document embeds', async () => {
    const workbook = await workbookBytes([['Deploy'], [RECOGNISED_SECRET]]);
    const bytes = await docxWith([['Quarterly brief']], { [EMBEDDED]: workbook });
    const embedded = await (await JSZip.loadAsync(bytes)).file(EMBEDDED)!.async('nodebuffer');
    expect(Buffer.from(bytes).includes(Buffer.from(LIVE_KEY))).toBe(false);
    expect(embedded.includes(Buffer.from(LIVE_KEY))).toBe(false);
    expect(await memberText(workbook, 'xl/sharedStrings.xml')).toContain(LIVE_KEY);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('refuses a package nested two deep as over the limits', async () => {
    const inner = await docxWith([['Inner']], {}, 0);
    const holder = await workbookArchive([['Middle']]);
    holder.file('xl/embeddings/Microsoft_Word_Document.docx', inner);
    const nested = await holder.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const bytes = await docxWith([['Quarterly brief']], { [EMBEDDED]: nested });

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'limits_exceeded' });
  });

  it('refuses a held package that cannot be opened as damaged', async () => {
    const damaged = mediaBytes(4_096);
    damaged.set(ZIP_LOCAL_HEADER, 0);
    const bytes = await docxWith([['Quarterly brief']], { [EMBEDDED]: damaged });

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'type_mismatch' });
  });
});

describe('a credential the markup splits where no reader joins it', () => {
  const split = (tag: string) =>
    `<${tag}>${escapeXml(RECOGNISED_SECRET.slice(0, SPLIT_AT))}</${tag}><${tag}>${escapeXml(RECOGNISED_SECRET.slice(SPLIT_AT))}</${tag}>`;

  it('is found across two runs of a header no reader opens', async () => {
    const bytes = await docxWith([['Quarterly brief']], {
      'word/header1.xml': `<?xml version="1.0"?><w:hdr xmlns:w="w"><w:p><w:r>${split('w:t')}</w:r></w:p></w:hdr>`,
    });
    expect(await memberText(bytes, 'word/header1.xml')).not.toContain(LIVE_KEY);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('is found across two runs of a document that carries macros, which no reader opens', async () => {
    const bytes = await docxWith(
      [
        ['Quarterly brief'],
        [RECOGNISED_SECRET.slice(0, SPLIT_AT), RECOGNISED_SECRET.slice(SPLIT_AT)],
      ],
      { 'word/vbaProject.bin': 'Attribute VB_Name = "Module1"' },
    );
    expect(await memberText(bytes, 'word/document.xml')).not.toContain(LIVE_KEY);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('a credential the markup splits in a layout no reader joins', () => {
  const [head, tail] = [RECOGNISED_SECRET.slice(0, SPLIT_AT), RECOGNISED_SECRET.slice(SPLIT_AT)];

  it('is found across the text runs of a legacy drawing', async () => {
    const bytes = await docxWith([['Quarterly brief']], {
      'word/vmlDrawing1.vml': `<xml xmlns:v="urn:schemas-microsoft-com:vml"><v:shape><v:textbox><div><font>${escapeXml(head)}</font><font>${escapeXml(tail)}</font></div></v:textbox></v:shape></xml>`,
    });
    expect(await memberText(bytes, 'word/vmlDrawing1.vml')).not.toContain(LIVE_KEY);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('is found across two runs a writer laid out on lines of their own', async () => {
    const header = [
      '<?xml version="1.0"?>',
      '<w:hdr xmlns:w="w">',
      '  <w:p>',
      '    <w:r>',
      `      <w:t>${escapeXml(head)}</w:t>`,
      '    </w:r>',
      '    <w:r>',
      `      <w:t>${escapeXml(tail)}</w:t>`,
      '    </w:r>',
      '  </w:p>',
      '</w:hdr>',
    ].join('\n');
    const bytes = await docxWith([['Quarterly brief']], { 'word/header1.xml': header });
    expect(await memberText(bytes, 'word/header1.xml')).not.toContain(LIVE_KEY);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });

  it('keeps the space a run holds as its only text', async () => {
    const token = 'Q7xLm2Vb9RtZa4YbW3CnH8sJ';
    const bytes = await docxWith([['Quarterly brief']], {
      'word/header1.xml': `<?xml version="1.0"?><w:hdr xmlns:w="w"><w:p><w:r><w:t>Authorization: Bearer</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>${token}</w:t></w:r></w:p></w:hdr>`,
    });
    expect(await smallFileOutcome(`Authorization: Bearer ${token}`, policyInspector('block'))).toBe(
      'refused',
    );

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('block') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('a part written in UTF-16', () => {
  const xml = `<?xml version="1.0" encoding="UTF-16"?><settings><deploy>${RECOGNISED_SECRET}</deploy></settings>`;
  const littleEndian = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
  const bigEndian = Buffer.from(xml, 'utf16le').swap16();

  it.each([
    ['little-endian with a byte order mark', littleEndian],
    ['big-endian with only its declaration', bigEndian],
  ])('is decoded before the scan: %s', async (_label, part) => {
    const bytes = await docxWith([['Quarterly brief']], { 'customXml/item1.xml': part });
    expect(Buffer.from(await memberBytes(bytes, 'customXml/item1.xml')).includes(LIVE_KEY)).toBe(
      false,
    );

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'dlp_blocked' });
  });
});

describe('a package whose member names alias each other', () => {
  /** A member holding a secret, then a second record whose name resolves to the same member. */
  async function aliasedPackage(): Promise<Uint8Array> {
    const source = await JSZip.loadAsync(await docxWith([['Quarterly brief']]));
    const zip = new JSZip();
    zip.file('media/picture.png', mediaBytes(MEDIA_BYTES), { compression: 'STORE' });
    for (const entry of Object.values(source.files)) {
      if (!entry.dir) zip.file(entry.name, await entry.async('uint8array'));
    }
    zip.file('customXml/item1.xml', `<deploy>${RECOGNISED_SECRET}</deploy>`, {
      createFolders: false,
    });
    zip.file('z/../customXml/item1.xml', '<deploy>nothing here</deploy>', {
      createFolders: false,
    });
    return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  }

  it('is refused as damaged, so the member the library hides is never left unread', async () => {
    const bytes = await aliasedPackage();
    expect(await memberText(bytes, 'customXml/item1.xml')).not.toContain(LIVE_KEY);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('warn') });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'type_mismatch' });
  });

  it('is refused as damaged when its end record understates how many records the directory holds', async () => {
    const bytes = await aliasedPackage();
    const buffer = Buffer.from(bytes);
    const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const records = buffer.readUInt16LE(end + 10);
    buffer.writeUInt16LE(records - 1, end + 8);
    buffer.writeUInt16LE(records - 1, end + 10);
    const listed = await JSZip.loadAsync(buffer);
    expect(Object.keys(listed.files)).toHaveLength(records - 1);
    expect(await listed.file('customXml/item1.xml')!.async('string')).not.toContain(LIVE_KEY);

    const result = await packageOutcome(new Uint8Array(buffer), DOCX, {
      inspectContent: policyInspector('warn'),
    });

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'type_mismatch' });
  });
});

describe('the readers of the sealed file', () => {
  it('none runs during the scan, which reads every text part with its markup removed instead', async () => {
    const bytes = await docxWith([['Quarterly brief']]);
    vi.mocked(extractOfficeDocumentText).mockClear();

    const result = await packageOutcome(bytes, DOCX);

    expect(result.outcome).toBe('accepted');
    expect(extractOfficeDocumentText).not.toHaveBeenCalled();
  });
});

describe('a document with many charts', () => {
  const CHARTS = 130;

  it('seals when its members and those of every chart workbook together pass what one archive may hold', async () => {
    const workbook = await workbookArchive([['Series']], [CHART_NUMBER]);
    for (const path of [
      '_rels/.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'xl/theme/theme1.xml',
      'xl/calcChain.xml',
      'xl/_rels/sharedStrings.xml.rels',
    ]) {
      workbook.file(path, '<?xml version="1.0"?><part/>');
    }
    const embedded = await workbook.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const extra: Record<string, string | Uint8Array> = {};
    for (let chart = 1; chart <= CHARTS; chart += 1) {
      extra[`word/charts/chart${chart}.xml`] =
        `<?xml version="1.0"?><c:chartSpace xmlns:c="c"><c:v>${CHART_NUMBER}</c:v></c:chartSpace>`;
      extra[`word/charts/_rels/chart${chart}.xml.rels`] =
        `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="../embeddings/Microsoft_Excel_Worksheet${chart}.xlsx"/></Relationships>`;
      extra[`word/charts/style${chart}.xml`] =
        '<?xml version="1.0"?><cs:chartStyle xmlns:cs="cs"/>';
      extra[`word/charts/colors${chart}.xml`] =
        '<?xml version="1.0"?><cs:colorStyle xmlns:cs="cs"/>';
      extra[`word/embeddings/Microsoft_Excel_Worksheet${chart}.xlsx`] = embedded;
    }
    const bytes = await docxWith([['Board report']], extra, 0);
    const outer = Object.values((await JSZip.loadAsync(bytes)).files).filter((file) => !file.dir);
    const inner = Object.values((await JSZip.loadAsync(embedded)).files).filter(
      (file) => !file.dir,
    );
    expect(outer.length).toBeLessThanOrEqual(MAX_ARCHIVE_MEMBERS);
    expect(inner.length).toBeGreaterThanOrEqual(12);
    expect(outer.length + CHARTS * inner.length).toBeGreaterThan(MAX_ARCHIVE_MEMBERS);

    const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector('block') });

    expect(result.outcome).toBe('accepted');
    expect(bytes.byteLength).toBeLessThan(CHAT_LARGE_FILE_POLICY.kinds.text.bytesPerStep);
    expect(cursorsOf(result.directives).length).toBeGreaterThanOrEqual(
      Math.ceil((outer.length + CHARTS * inner.length) / MAX_ARCHIVE_MEMBERS),
    );
  }, 60_000);
});

describe('the steps of the package scan', () => {
  const BIG_PART = 'customXml/item1.xml';
  const bigPart = `<?xml version="1.0"?><notes>${FILLER.repeat(40_000)}${UNRECOGNISED_TOKEN}</notes>`;

  async function stepUntilDone(
    harness: IntakeHarness,
    row: ChatFileIntakeRow,
    failOnce?: (directive: ChatFileIntakeDirective) => boolean,
  ): Promise<ChatFileIntakeDirective[]> {
    const seen: ChatFileIntakeDirective[] = [];
    let directive: ChatFileIntakeDirective = { next: 'start' };
    let failed = false;
    while (directive.next === 'start' || directive.next === 'inspect') {
      const failing = !failed && failOnce?.(directive) === true;
      try {
        directive = await runChatFileIntakeStep(
          harness.deps,
          { intakeId: row.id, runId: 'run-1' },
          directive,
        );
        seen.push(directive);
      } catch (error) {
        if (!failing) throw error;
        failed = true;
      }
    }
    return seen;
  }

  it('reads at most a text step of inflated bytes per step and the whole file once per step', async () => {
    const bytes = await docxWith([['Quarterly brief']], { [BIG_PART]: bigPart });
    const { outcome, readHead, directives } = await packageOutcome(bytes, DOCX, {
      policy: withStep(SMALL_STEP),
    });

    expect(outcome).toBe('accepted');
    const cursors = cursorsOf(directives);
    const steps = cursors.length;
    expect(steps).toBeGreaterThanOrEqual(Math.ceil(bigPart.length / SMALL_STEP));
    expect(readHead.mock.calls.map(([, maxBytes]) => maxBytes)).toEqual([
      UPLOAD_INSPECTION_BYTES,
      ...cursors.map(() => bytes.byteLength),
    ]);
    const owned = vi
      .mocked(scanUploadRangeForCredentials)
      .mock.calls.map(([window, , range]) => ({ window: window.byteLength, ...range }));
    expect(Math.max(...owned.map((call) => call.window))).toBeLessThanOrEqual(
      UPLOAD_INSPECTION_BYTES,
    );
    for (const cursor of cursors) {
      expect(JSON.stringify(cursor)).not.toMatch(/quick brown|Xk7pQ2|Quarterly/);
    }
  });

  it('inflates a part it is continuing in only once per step, from the length the cursor carries', async () => {
    const bytes = await docxWith([['Quarterly brief']], { [BIG_PART]: bigPart });
    const { row, harness } = await stagedPackage(bytes, DOCX, { policy: withStep(SMALL_STEP) });
    const members = Object.values((await JSZip.loadAsync(bytes)).files).filter((file) => !file.dir);
    const bigPartIndex = members.findIndex((file) => file.name === BIG_PART) + 1;
    const entry = members[bigPartIndex - 1]!;
    const nodeStream = vi.spyOn(Object.getPrototypeOf(entry) as JSZip.JSZipObject, 'nodeStream');
    const inflationsPerStep: number[] = [];
    const views = new Set<string>();
    let directive: ChatFileIntakeDirective = { next: 'start' };
    try {
      while (directive.next === 'start' || directive.next === 'inspect') {
        const from =
          directive.next === 'inspect' &&
          directive.cursor?.scan === 'package' &&
          directive.cursor.part === bigPartIndex &&
          directive.cursor.partBytes !== undefined
            ? directive.cursor
            : null;
        nodeStream.mockClear();
        directive = await runChatFileIntakeStep(
          harness.deps,
          { intakeId: row.id, runId: 'run-1' },
          directive,
        );
        const inflations = nodeStream.mock.contexts.filter(
          (context) => (context as JSZip.JSZipObject).name === BIG_PART,
        ).length;
        const to = directive.next === 'inspect' ? directive.cursor : undefined;
        if (from && to?.scan === 'package' && to.part === from.part && to.view === from.view) {
          inflationsPerStep.push(inflations);
          views.add(to.view ?? 'bytes');
        }
      }
    } finally {
      nodeStream.mockRestore();
    }

    expect(directive).toEqual({ next: 'submit' });
    expect(inflationsPerStep.length).toBeGreaterThan(1);
    expect(views).toEqual(new Set(['bytes', 'unmarked']));
    expect(inflationsPerStep).toEqual(inflationsPerStep.map(() => 1));
  });

  it('scans the same part again on a retry, so nothing is skipped or counted twice', async () => {
    const bytes = await docxWith([['Quarterly brief']], { [BIG_PART]: bigPart });
    const clean = await stagedPackage(bytes, DOCX, { policy: withStep(SMALL_STEP) });
    const expected = await stepUntilDone(clean.harness, clean.row);
    expect(cursorsOf(expected).length).toBeGreaterThan(2);
    expect(expected.at(-1)).toEqual({ next: 'submit' });
    expect(cursorsOf(expected).at(-1)!.findings).toEqual([]);

    stubMemoryObjectStorage();
    const retried = await stagedPackage(bytes, DOCX, { policy: withStep(SMALL_STEP) });
    let shortReadsLeft = 0;
    const readHead = retried.harness.deps.objects.readHead;
    retried.harness.deps.objects = {
      ...retried.harness.deps.objects,
      readHead: async (key, maxBytes) => {
        const whole = await readHead(key, maxBytes);
        if (shortReadsLeft === 0 || maxBytes !== bytes.byteLength) return whole;
        shortReadsLeft -= 1;
        return whole!.subarray(0, maxBytes - 1);
      },
    };
    let packageSteps = 0;
    let armed = false;
    const outcome = await stepUntilDone(retried.harness, retried.row, (directive) => {
      if (directive.next === 'inspect' && directive.cursor) packageSteps += 1;
      if (packageSteps !== 2 || armed) return false;
      armed = true;
      shortReadsLeft = 2;
      return true;
    });

    expect(armed).toBe(true);
    expect(shortReadsLeft).toBe(0);
    expect(outcome).toEqual(expected);
  });

  it('refuses changed_during_check when the object changes between steps', async () => {
    const bytes = await docxWith([['Quarterly brief']], { [BIG_PART]: bigPart });
    const { row, harness } = await stagedPackage(bytes, DOCX, { policy: withStep(SMALL_STEP) });
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
    expect(harness.seal.media).toEqual([]);
  });
});

describe('a package the scan cannot read to its end', () => {
  it.each(['block', 'warn'] as const)(
    'refuses a password protected document as encrypted, under a %s policy',
    async (mode) => {
      const bytes = mediaBytes(MEDIA_BYTES);
      bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);

      const result = await packageOutcome(bytes, DOCX, { inspectContent: policyInspector(mode) });

      expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'encrypted' });
    },
  );

  it('refuses a damaged package as not the type it was declared', async () => {
    const bytes = mediaBytes(MEDIA_BYTES);
    bytes.set([0x50, 0x4b, 0x03, 0x04], 0);

    const result = await packageOutcome(bytes, XLSX);

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'type_mismatch' });
  });

  it('refuses a part that inflates past the archive ratio as over the limits', async () => {
    const bytes = await docxWith(
      [['Quarterly brief']],
      { 'customXml/item1.xml': 'a'.repeat(10 * 1024 * 1024) },
      0,
    );

    const result = await packageOutcome(bytes, DOCX);

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'limits_exceeded' });
  });

  it('refuses a package with more members than an archive may hold as over the limits', async () => {
    const members: Record<string, string> = {};
    for (let index = 0; index < 2_001; index += 1) members[`customXml/item${index}.xml`] = '<a/>';
    const bytes = await docxWith([['Quarterly brief']], members, 0);

    const result = await packageOutcome(bytes, DOCX);

    expect(result).toMatchObject({ outcome: 'refused', refusalCode: 'limits_exceeded' });
  });
});
