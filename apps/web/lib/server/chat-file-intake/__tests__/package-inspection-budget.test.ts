// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');
type ArchiveBoundsModule = typeof import('@/lib/security/archive-bounds');

const OFFICE_READ_BYTES = vi.hoisted(() => 1024 * 1024);
const TOTAL_BUDGET_BYTES = 2 * OFFICE_READ_BYTES;

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: vi.fn(),
}));
vi.mock('@/lib/security/archive-bounds', async (importOriginal) => ({
  ...(await importOriginal<ArchiveBoundsModule>()),
  MAX_OFFICE_UNCOMPRESSED_BYTES: OFFICE_READ_BYTES,
}));

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { MAX_OFFICE_UNCOMPRESSED_BYTES } from '@/lib/security/archive-bounds';
import { getKeyValueStore } from '@/lib/server/key-value';
import { createFakeScanner } from './fake-scanner';
import {
  createIntakeHarness,
  putStagedFile,
  runInline,
  START_MS,
  stubMemoryObjectStorage,
} from './inline-executor';
import { intakeRow } from './memory-intake-store';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FILLER = 'the quick brown fox jumps over the lazy dog\n';

beforeEach(() => {
  stubMemoryObjectStorage();
  vi.mocked(getKeyValueStore).mockReturnValue(createMemoryKeyValueStore());
});

/** Incompressible bytes, so the archive ratio allows far more than the total. */
function pictureBytes(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  let state = 0x2545f491;
  for (let index = 0; index < byteCount; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

/**
 * A package's members may inflate to no more than the malware scan reads, here
 * scaled down, and a text file the scan reads may be smaller still.
 */
const policy = {
  ...CHAT_LARGE_FILE_POLICY,
  largeFiles: { ...CHAT_LARGE_FILE_POLICY.largeFiles, maxPackageInflatedBytes: TOTAL_BUDGET_BYTES },
  kinds: {
    ...CHAT_LARGE_FILE_POLICY.kinds,
    text: { ...CHAT_LARGE_FILE_POLICY.kinds.text, maxBytes: OFFICE_READ_BYTES / 2 },
  },
};

/** The malware scan's own limit on the bytes it reads from one file, archives unpacked, in clamd's units. */
function clamdMaxScanBytes(): number {
  const config = readFileSync(
    new URL('../../../../../../services/upload-scanner/src/config.ts', import.meta.url),
    'utf8',
  );
  const setting = /^\s*MaxScanSize:\s*'(\d+)([KM]?)',?\s*$/m.exec(config);
  if (!setting?.[1]) throw new Error('The upload scanner no longer sets MaxScanSize.');
  const unit = setting[2] === 'M' ? 1024 * 1024 : setting[2] === 'K' ? 1024 : 1;
  return Number(setting[1]) * unit;
}

/** The scan reads every member, whatever preparation would read of them. */
async function packageWithText(textBytes: number): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('media/picture.png', pictureBytes(100_000), { compression: 'STORE' });
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="w"/>');
  zip.file('customXml/item1.xml', FILLER.repeat(Math.ceil(textBytes / FILLER.length)));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function intakeOutcome(bytes: Uint8Array) {
  const base = intakeRow({
    fileName: 'brief.docx',
    mimeType: DOCX_TYPE,
    byteCount: bytes.byteLength,
    dailyBytesCharged: bytes.byteLength,
    stagingKey: 'chat-attachments/user-owner/1731000000000_abc123defgh45.docx',
    createdAt: START_MS,
    stateChangedAt: START_MS,
  });
  const staged = await putStagedFile(base, bytes);
  const row = { ...base, declaredSha256: staged.sha256 };
  const harness = createIntakeHarness({
    scanner: createFakeScanner({
      submit: () => ({ answer: 'submitAccepted' }),
      poll: () => ({
        answer: 'pollDoneClean',
        verdict: { sha256: staged.sha256, bytes: row.byteCount, etag: staged.etag },
      }),
    }),
    rows: [row],
    overrides: { policy },
  });
  await runInline(harness, { intakeId: row.id, runId: 'run-1' });
  return { ended: harness.store.row(row.id), harness };
}

describe('the total budget of the package scan', () => {
  it('is the bytes the malware scan reads from one file, as the upload scanner configures clamd', () => {
    expect(CHAT_LARGE_FILE_POLICY.largeFiles.maxPackageInflatedBytes).toBe(clamdMaxScanBytes());
  });

  it('refuses a package whose members inflate past what the malware scan reads as over the limits', async () => {
    const bytes = await packageWithText(TOTAL_BUDGET_BYTES + 1024 * 1024);
    expect(bytes.byteLength * 120).toBeGreaterThan(TOTAL_BUDGET_BYTES + 1024 * 1024);

    const { ended, harness } = await intakeOutcome(bytes);

    expect(ended).toMatchObject({ state: 'rejected', refusalCode: 'limits_exceeded' });
    expect(harness.presignGet).not.toHaveBeenCalled();
    expect(harness.seal.media).toEqual([]);
  });

  it('seals a package whose members inflate past what a text scan reads but fit the total', async () => {
    const textBytes = policy.kinds.text.maxBytes + OFFICE_READ_BYTES / 4;
    expect(textBytes).toBeLessThan(MAX_OFFICE_UNCOMPRESSED_BYTES);

    const { ended } = await intakeOutcome(await packageWithText(textBytes));

    expect(ended.state).toBe('sealed');
  });

  it('seals a package whose members inflate past what preparation reads in memory but fit the total', async () => {
    const textBytes = MAX_OFFICE_UNCOMPRESSED_BYTES + OFFICE_READ_BYTES / 2;
    expect(MAX_OFFICE_UNCOMPRESSED_BYTES).toBe(OFFICE_READ_BYTES);
    expect(textBytes).toBeLessThan(TOTAL_BUDGET_BYTES - 200_000);

    const { ended } = await intakeOutcome(await packageWithText(textBytes));

    expect(ended.state).toBe('sealed');
  });
});
