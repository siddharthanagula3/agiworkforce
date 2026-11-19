// @vitest-environment node
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import type { SecretHandlingMode } from '@agiworkforce/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');
type UploadScanModule = typeof import('@/lib/security/upload-scan');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type ClaimedUserScopeDbModule = typeof import('@/lib/server/claimed-user-scope-db');
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

import { CHAT_LARGE_FILE_POLICY, chatLargeFileKind } from '@/lib/chat-attachment-policy';
import {
  CREDENTIAL_SCAN_GUARD_BYTES,
  UPLOAD_INSPECTION_BYTES,
  inspectUploadHead,
  scanUploadRangeForCredentials,
} from '@/lib/security/upload-scan';
import { extractNotebookCellText } from '@/lib/server/chat-file-preparation/text-stream';
import { getKeyValueStore } from '@/lib/server/key-value';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import {
  CREDENTIAL_WINDOW_OWNED_BYTES,
  firstCursorAfterHead,
  openPrivateObjectRange,
  scanCredentialRange,
  type ChatFileInspectionCursor,
  type OpenObjectRange,
} from '../full-inspection';
import { createChatFileIntakeDeps, runChatFileIntakeStep, type ChatFileIntakeDeps } from '../steps';
import type { ChatFileIntakeRow } from '../store';
import type { ChatFileIntakeDirective } from '../transitions';
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
const FILLER = 'the quick brown fox jumps over the lazy dog\n';
const TEXT_KEY = 'chat-attachments/user-owner/1731000000000_abc123defgh45.txt';
const SMALL_STEP = 400_000;

const encoder = new TextEncoder();

beforeEach(() => {
  stubMemoryObjectStorage();
  vi.mocked(getKeyValueStore).mockReturnValue(createMemoryKeyValueStore());
  vi.mocked(scanUploadRangeForCredentials).mockImplementation(
    actualUploadScan.scanUploadRangeForCredentials,
  );
});

/** Ordinary prose of `byteCount` bytes with each text written at its offset, on a line of its own. */
function textFile(byteCount: number, placed: ReadonlyArray<[number, string]> = []): Uint8Array {
  const filler = encoder.encode(FILLER);
  const bytes = new Uint8Array(byteCount);
  for (let offset = 0; offset < byteCount; offset += filler.byteLength) {
    bytes.set(filler.subarray(0, Math.min(filler.byteLength, byteCount - offset)), offset);
  }
  for (const [offset, text] of placed) bytes.set(encoder.encode(`\n${text}\n`), offset - 1);
  return bytes;
}

/** The offset that puts the live key itself at `keyStart`. */
function secretLineAt(keyStart: number): number {
  return keyStart - RECOGNISED_SECRET.indexOf(LIVE_KEY);
}

interface Declared {
  fileName: string;
  mimeType: string;
}

const PLAIN_TEXT: Declared = { fileName: 'notes.txt', mimeType: 'text/plain' };

function textRow(byteCount: number, declared: Declared = PLAIN_TEXT): ChatFileIntakeRow {
  return intakeRow({
    ...declared,
    byteCount,
    dailyBytesCharged: byteCount,
    stagingKey: TEXT_KEY,
    createdAt: START_MS,
    stateChangedAt: START_MS,
  });
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

async function stagedText(
  bytes: Uint8Array,
  overrides: Partial<ChatFileIntakeDeps> = {},
  declared: Declared = PLAIN_TEXT,
): Promise<{ row: ChatFileIntakeRow; harness: IntakeHarness }> {
  const base = textRow(bytes.byteLength, declared);
  const staged = await putStagedFile(base, bytes);
  const row = { ...base, declaredSha256: staged.sha256 };
  const scanner = createFakeScanner({
    submit: () => ({ answer: 'submitAccepted' }),
    poll: () => ({
      answer: 'pollDoneClean',
      verdict: { sha256: staged.sha256, bytes: row.byteCount, etag: staged.etag },
    }),
  });
  return { row, harness: createIntakeHarness({ scanner, rows: [row], overrides }) };
}

type Outcome = 'refused' | 'accepted';

async function largeOutcome(
  bytes: Uint8Array,
  overrides: Partial<ChatFileIntakeDeps> = {},
  declared: Declared = PLAIN_TEXT,
): Promise<{ outcome: Outcome; row: ChatFileIntakeRow; harness: IntakeHarness }> {
  const { row, harness } = await stagedText(bytes, overrides, declared);
  await runInline(harness, { intakeId: row.id, runId: 'run-1' });
  const ended = harness.store.row(row.id);
  if (ended.state === 'rejected') {
    expect(ended.refusalCode).toBe('dlp_blocked');
    expect(harness.seal.media).toEqual([]);
    return { outcome: 'refused', row: ended, harness };
  }
  expect(ended.state).toBe('sealed');
  return { outcome: 'accepted', row: ended, harness };
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

/** What the inline path decides for a small file: the same inspection, then the same data policy. */
async function smallFileOutcome(
  text: string,
  inspectContent: ChatFileIntakeDeps['inspectContent'],
): Promise<Outcome> {
  const bytes = textFile(4_096, [[100, text]]);
  const inspection = inspectUploadHead(bytes, 'text/plain', 'notes.txt');
  if (!inspection.ok) return 'refused';
  const verdict = await inspectContent(textRow(bytes.byteLength), bytes, inspection.findings);
  return verdict === 'blocked' ? 'refused' : 'accepted';
}

describe('the credential scan of a large text file', () => {
  it.each(['block', 'redact', 'warn'] as const)(
    'gives a secret after the first 256,000 bytes the verdict a small file gets, under a %s policy',
    async (mode) => {
      const inspectContent = policyInspector(mode);
      for (const [secret, expected] of [
        [RECOGNISED_SECRET, 'refused'],
        [UNRECOGNISED_TOKEN, mode === 'warn' ? 'accepted' : 'refused'],
      ] as const) {
        stubMemoryObjectStorage();
        const small = await smallFileOutcome(secret, inspectContent);
        const large = await largeOutcome(textFile(1_500_000, [[1_000_000, secret]]), {
          inspectContent,
        });

        expect(small).toBe(expected);
        expect(large.outcome).toBe(small);
      }
    },
  );

  it('refuses a recognised secret late in the file under a block policy and never seals or scans it', async () => {
    const { outcome, harness } = await largeOutcome(
      textFile(2_000_000, [[1_900_000, RECOGNISED_SECRET]]),
      { inspectContent: policyInspector('block') },
    );

    expect(outcome).toBe('refused');
    expect(harness.presignGet).not.toHaveBeenCalled();
    expect(harness.seal.media).toEqual([]);
  });

  it.each([
    ['the end of the head', UPLOAD_INSPECTION_BYTES - 10],
    [
      'the edge of a window',
      UPLOAD_INSPECTION_BYTES - CREDENTIAL_SCAN_GUARD_BYTES + CREDENTIAL_WINDOW_OWNED_BYTES - 10,
    ],
    ['the edge of a step', UPLOAD_INSPECTION_BYTES - CREDENTIAL_SCAN_GUARD_BYTES + SMALL_STEP - 10],
  ])('finds a secret that straddles %s', async (_label, keyStart) => {
    const { outcome } = await largeOutcome(
      textFile(1_500_000, [[secretLineAt(keyStart), RECOGNISED_SECRET]]),
      { policy: withStep(SMALL_STEP) },
    );

    expect(outcome).toBe('refused');
  });

  it('reports a match across a window edge once, from the window its start belongs to', async () => {
    const keyStart = 300_000;
    const bytes = textFile(400_000, [[secretLineAt(keyStart), RECOGNISED_SECRET]]);
    const open: OpenObjectRange = async (_key, start, end) =>
      new Blob([bytes.slice(start, end)]).stream();
    const split = keyStart + 5;

    const left = await scanCredentialRange({
      openRange: open,
      key: TEXT_KEY,
      mimeType: 'text/plain',
      byteCount: bytes.byteLength,
      ownedFrom: 200_000,
      ownedTo: split,
    });
    const right = await scanCredentialRange({
      openRange: open,
      key: TEXT_KEY,
      mimeType: 'text/plain',
      byteCount: bytes.byteLength,
      ownedFrom: split,
      ownedTo: bytes.byteLength,
    });

    expect(left).toEqual({
      kind: 'read',
      rejected: true,
      findings: [{ code: 'credential_material', detail: `Stripe Live Key at byte ${keyStart}` }],
    });
    expect(right).toEqual({ kind: 'read', rejected: false, findings: [] });
  });

  it('seals a clean large text file as before, and its scan reads every byte once', async () => {
    const bytes = textFile(1_500_000);
    const { outcome, harness } = await largeOutcome(bytes, { policy: withStep(SMALL_STEP) });

    expect(outcome).toBe('accepted');
    expect(harness.seal.media).toHaveLength(1);
    expect(harness.presignGet).toHaveBeenCalledTimes(1);
    const owned = vi
      .mocked(scanUploadRangeForCredentials)
      .mock.calls.map(([, , range]) => [range.ownedStart, range.ownedEnd]);
    expect(owned[0]![0]).toBe(UPLOAD_INSPECTION_BYTES - CREDENTIAL_SCAN_GUARD_BYTES);
    expect(owned.at(-1)![1]).toBe(bytes.byteLength);
    for (let index = 1; index < owned.length; index += 1) {
      expect(owned[index]![0]).toBe(owned[index - 1]![1]);
    }
  });

  it("reads a PDF's own bytes through ranges from its first byte, since the head reads none of them", async () => {
    const openRange = vi.fn(openPrivateObjectRange);
    const base = intakeRow({ createdAt: START_MS, stateChangedAt: START_MS });
    const staged = await putStagedFile(base);
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
      overrides: { openRange },
    });

    const run = await runInline(harness, { intakeId: row.id, runId: 'run-1' });

    expect(run.last).toEqual({ next: 'end', reason: 'finished' });
    const ranges = openRange.mock.calls.map(([, start, end]) => [start, end]);
    expect(ranges[0]![0]).toBe(0);
    expect(ranges.at(-1)![1]).toBe(row.byteCount);
  });
});

describe('a text file declared with a type that is not text', () => {
  const declaredTypes: Declared[] = [
    { fileName: 'notes.txt', mimeType: 'application/octet-stream' },
    { fileName: 'index.ts', mimeType: 'video/mp2t' },
    { fileName: 'rows.csv', mimeType: 'application/vnd.ms-excel' },
    { fileName: 'config.toml', mimeType: 'application/toml' },
    { fileName: 'analysis.ipynb', mimeType: 'application/x-ipynb+json' },
    { fileName: 'notes.txt', mimeType: 'application/pdf' },
  ];

  it.each(declaredTypes)(
    'refuses $fileName declared $mimeType with a recognised secret in the head or after it under a block policy',
    async (declared) => {
      expect(chatLargeFileKind(declared.fileName, declared.mimeType)).not.toBeNull();
      const inspectContent = policyInspector('block');
      for (const offset of [100, 1_000_000]) {
        stubMemoryObjectStorage();
        const { outcome, harness } = await largeOutcome(
          textFile(1_500_000, [[offset, RECOGNISED_SECRET]]),
          { inspectContent },
          declared,
        );

        expect(outcome).toBe('refused');
        expect(harness.presignGet).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['block', 'redact', 'warn'] as const)(
    'gives a file declared application/octet-stream the verdict a small text file gets, under a %s policy',
    async (mode) => {
      const inspectContent = policyInspector(mode);
      const declared = { fileName: 'notes.txt', mimeType: 'application/octet-stream' };
      for (const secret of [RECOGNISED_SECRET, UNRECOGNISED_TOKEN]) {
        stubMemoryObjectStorage();
        const small = await smallFileOutcome(secret, inspectContent);
        const large = await largeOutcome(
          textFile(1_500_000, [[1_000_000, secret]]),
          { inspectContent },
          declared,
        );

        expect(large.outcome).toBe(small);
      }
    },
  );

  it('seals a clean .ts file declared video/mp2t after scanning every byte as text', async () => {
    const bytes = textFile(1_500_000);
    const { outcome } = await largeOutcome(
      bytes,
      { policy: withStep(SMALL_STEP) },
      {
        fileName: 'index.ts',
        mimeType: 'video/mp2t',
      },
    );

    expect(outcome).toBe('accepted');
    const calls = vi.mocked(scanUploadRangeForCredentials).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([, mimeType]) => mimeType === 'text/plain')).toBe(true);
    expect(calls.at(-1)![2].ownedEnd).toBe(bytes.byteLength);
  });
});

describe('a file whose scan cannot finish', () => {
  it('is never submitted or sealed when a range comes back short, and stays held for the sweeper', async () => {
    const { row, harness } = await stagedText(textFile(1_500_000));
    const openRange: OpenObjectRange = async (key, start, end) =>
      openPrivateObjectRange(key, start, end - 1);
    harness.deps.openRange = openRange;

    await expect(runInline(harness, { intakeId: row.id, runId: 'run-1' })).rejects.toThrow(
      /came back short/,
    );

    expect(harness.store.row(row.id)).toMatchObject({ state: 'inspecting', etag: null });
    expect(harness.presignGet).not.toHaveBeenCalled();
    expect(harness.seal.media).toEqual([]);
  });

  it('refuses changed_during_check when the object changes between steps', async () => {
    const { row, harness } = await stagedText(textFile(1_500_000), {
      policy: withStep(SMALL_STEP),
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
    expect(harness.seal.media).toEqual([]);
  });
});

describe('the steps of the scan', () => {
  async function inspectingRun(bytes: Uint8Array, openRange: OpenObjectRange) {
    const { row, harness } = await stagedText(bytes, { policy: withStep(SMALL_STEP), openRange });
    const first = await runChatFileIntakeStep(
      harness.deps,
      { intakeId: row.id, runId: 'run-1' },
      { next: 'start' },
    );
    expect(first).toEqual({ next: 'inspect' });
    return { row, harness };
  }

  async function stepUntilDone(
    harness: IntakeHarness,
    row: ChatFileIntakeRow,
    failOnce?: (directive: ChatFileIntakeDirective) => boolean,
  ): Promise<ChatFileIntakeDirective[]> {
    const seen: ChatFileIntakeDirective[] = [];
    let directive: ChatFileIntakeDirective = { next: 'inspect' };
    let failed = false;
    while (directive.next === 'inspect') {
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

  it('scans the same range again on a retry, so nothing is skipped or counted twice', async () => {
    const bytes = textFile(1_500_000, [[900_000, UNRECOGNISED_TOKEN]]);
    const clean = await inspectingRun(bytes, openPrivateObjectRange);
    const expected = await stepUntilDone(clean.harness, clean.row);

    stubMemoryObjectStorage();
    let breakNext = false;
    const flaky: OpenObjectRange = async (key, start, end) => {
      if (!breakNext) return openPrivateObjectRange(key, start, end);
      breakNext = false;
      const piece = 65_536;
      let sent = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= 2 * piece) {
            controller.error(new Error('connection reset'));
            return;
          }
          controller.enqueue(bytes.slice(start + sent, start + sent + piece));
          sent += piece;
        },
      });
    };
    const retried = await inspectingRun(bytes, flaky);
    const outcome = await stepUntilDone(retried.harness, retried.row, (directive) => {
      const cursor = 'cursor' in directive ? directive.cursor : undefined;
      if (cursor && cursor.ownedFrom > UPLOAD_INSPECTION_BYTES) breakNext = true;
      return breakNext;
    });

    expect(outcome).toEqual(expected);
    const cursors = expected
      .map((directive) => ('cursor' in directive ? directive.cursor : undefined))
      .filter((cursor): cursor is ChatFileInspectionCursor => cursor !== undefined);
    expect(cursors.map((cursor) => cursor.ownedFrom)).toEqual(
      cursors.map(
        (_cursor, index) =>
          UPLOAD_INSPECTION_BYTES - CREDENTIAL_SCAN_GUARD_BYTES + index * SMALL_STEP,
      ),
    );
    expect(cursors.at(-1)!.findings).toEqual([
      {
        code: 'credential_material',
        detail: expect.stringMatching(/^High-Entropy String at byte /),
      },
    ]);
    expect(expected.at(-1)).toEqual({ next: 'submit' });
  });

  it('inspects a file of the largest allowed size in steps and windows of bounded size', async () => {
    const byteCount = CHAT_LARGE_FILE_POLICY.kinds.text.maxBytes;
    const { bytesPerStep } = CHAT_LARGE_FILE_POLICY.kinds.text;
    const row: ChatFileIntakeRow = {
      ...textRow(byteCount),
      state: 'inspecting',
      workflowRunId: 'run-1',
      leaseUntil: START_MS + 60_000,
    };
    const zeros = new Uint8Array(1024 * 1024);
    const ranges: Array<[number, number]> = [];
    const openRange: OpenObjectRange = async (_key, start, end) => {
      ranges.push([start, end]);
      let remaining = end - start;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (remaining === 0) {
            controller.close();
            return;
          }
          const length = Math.min(zeros.byteLength, remaining);
          remaining -= length;
          controller.enqueue(zeros.subarray(0, length));
        },
      });
    };
    const windows: number[] = [];
    vi.mocked(scanUploadRangeForCredentials).mockImplementation((window) => {
      windows.push(window.byteLength);
      return [];
    });
    const harness = createIntakeHarness({
      scanner: createFakeScanner({}),
      rows: [row],
      overrides: { openRange },
    });
    harness.deps.objects = {
      ...harness.deps.objects,
      head: async () => ({
        contentLength: byteCount,
        contentType: 'text/plain',
        etag: '"whole"',
        checksumSha256: undefined,
        encryption: undefined,
        metadata: undefined,
      }),
      readHead: async (_key, maxBytes) => new Uint8Array(maxBytes),
    };

    let directive: ChatFileIntakeDirective = {
      next: 'inspect',
      cursor: firstCursorAfterHead('"whole"'),
    };
    let steps = 0;
    while (directive.next === 'inspect') {
      directive = await runChatFileIntakeStep(
        harness.deps,
        { intakeId: row.id, runId: 'run-1' },
        directive,
      );
      steps += 1;
    }

    const firstOwned = UPLOAD_INSPECTION_BYTES - CREDENTIAL_SCAN_GUARD_BYTES;
    expect(directive).toEqual({ next: 'submit' });
    expect(steps).toBe(Math.ceil((byteCount - firstOwned) / bytesPerStep));
    expect(ranges).toHaveLength(steps);
    for (const [start, end] of ranges) {
      expect(end - start).toBeLessThanOrEqual(bytesPerStep + 2 * CREDENTIAL_SCAN_GUARD_BYTES);
    }
    expect(ranges.at(-1)![1]).toBe(byteCount);
    expect(Math.max(...windows)).toBeLessThanOrEqual(UPLOAD_INSPECTION_BYTES);
    expect(windows.length).toBeGreaterThanOrEqual(
      Math.ceil((byteCount - firstOwned) / CREDENTIAL_WINDOW_OWNED_BYTES),
    );
  });
});

describe('the cells of a large notebook, read as preparation gives them to the model', () => {
  const NOTEBOOK: Declared = { fileName: 'analysis.ipynb', mimeType: 'application/x-ipynb+json' };
  const PROSE_CELL = JSON.stringify({ cell_type: 'markdown', source: [FILLER.repeat(8_000)] });
  const ESCAPED_KEY = `\\u0073${LIVE_KEY.slice(1)}`;

  function notebook(cells: readonly string[]): Uint8Array {
    return encoder.encode(
      `{"cells":[${[PROSE_CELL, ...cells].join(',')}],"metadata":{},"nbformat":4,"nbformat_minor":5}`,
    );
  }

  function codeCell(sourceJson: string, outputsJson = '[]'): string {
    return `{"cell_type":"code","source":${sourceJson},"outputs":${outputsJson}}`;
  }

  async function notebookOutcome(cells: readonly string[], policy?: ChatFileIntakeDeps['policy']) {
    const inspectContent = policyInspector('block');
    return largeOutcome(
      notebook(cells),
      { inspectContent, ...(policy ? { policy } : {}) },
      NOTEBOOK,
    );
  }

  it('refuses a key a cell holds with a JSON escape, which the file as bytes does not show', async () => {
    const bytes = notebook([codeCell(`["client = connect('${ESCAPED_KEY}')\\n"]`)]);
    expect(new TextDecoder().decode(bytes)).not.toContain(LIVE_KEY);

    const { outcome, harness } = await notebookOutcome([
      codeCell(`["client = connect('${ESCAPED_KEY}')\\n"]`),
    ]);

    expect(outcome).toBe('refused');
    expect(harness.presignGet).not.toHaveBeenCalled();
  });

  it.each([
    ['a stream output', `[{"output_type":"stream","text":["${ESCAPED_KEY}\\n"]}]`],
    [
      'a plain-text result',
      `[{"output_type":"execute_result","data":{"text/plain":["'${ESCAPED_KEY}'"]}}]`,
    ],
    ['an error value', `[{"output_type":"error","ename":"KeyError","evalue":"${ESCAPED_KEY}"}]`],
  ])('refuses an escaped key in %s', async (_where, outputsJson) => {
    const { outcome } = await notebookOutcome([codeCell('["run()\\n"]', outputsJson)]);

    expect(outcome).toBe('refused');
  });

  it('refuses a key split across two lines of a cell, which preparation joins', async () => {
    const [first, second] = [LIVE_KEY.slice(0, 12), LIVE_KEY.slice(12)];

    const { outcome } = await notebookOutcome([
      codeCell(`["client = connect('${first}","${second}')\\n"]`),
    ]);

    expect(outcome).toBe('refused');
  });

  it('refuses a secret an ordinary notebook writer stores with an escaped quote', async () => {
    const name = ['aws', 'secret', 'access', 'key'].join('_');
    const cell = JSON.stringify({
      cell_type: 'code',
      source: [`client = boto3.client('s3', ${name}="${'Ab1Cd2Ef3G'.repeat(4)}")\n`],
      outputs: [],
    });
    expect(cell).toContain(`${name}=\\"`);

    const { outcome } = await notebookOutcome([cell]);

    expect(outcome).toBe('refused');
  });

  it('refuses a key that lies past the first step of the cells, reading them a step at a time', async () => {
    const late = JSON.stringify({ cell_type: 'markdown', source: [FILLER.repeat(12_000)] });

    const { outcome } = await notebookOutcome(
      [late, codeCell(`["client = connect('${ESCAPED_KEY}')\\n"]`)],
      withStep(SMALL_STEP),
    );

    expect(outcome).toBe('refused');
  });

  const ESCAPED_TOKEN = [...UNRECOGNISED_TOKEN]
    .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .join('');

  it.each([
    [
      'in a part of the file the cells leave out, past the head',
      `{"cell_type":"raw","source":["${UNRECOGNISED_TOKEN.replaceAll('"', '\\"')}"]}`,
    ],
    ['in a cell, where only the decoded text shows it', codeCell(`["${ESCAPED_TOKEN}\\n"]`)],
  ])(
    'lets the workspace policy decide over a token no detector names, found %s',
    async (_where, cell) => {
      const decided: Outcome[] = [];
      for (const mode of ['block', 'warn'] as const) {
        stubMemoryObjectStorage();
        const { outcome } = await largeOutcome(
          notebook([cell]),
          { inspectContent: policyInspector(mode) },
          NOTEBOOK,
        );
        decided.push(outcome);
      }

      expect(decided).toEqual(['refused', 'accepted']);
    },
  );

  it('seals a notebook whose cells hold escapes and no credential', async () => {
    const { outcome, harness } = await notebookOutcome([
      codeCell(
        '["print(\\"caf\\u00e9\\")\\n"]',
        '[{"output_type":"stream","text":["caf\\u00e9\\n"]}]',
      ),
    ]);

    expect(outcome).toBe('accepted');
    expect(harness.seal.media).toHaveLength(1);
  });

  it('reads no cells of a notebook with more objects and arrays than its kind allows, which preparation refuses too', async () => {
    const containers = 5 + 3 * 50;
    const policy: ChatFileIntakeDeps['policy'] = {
      ...CHAT_LARGE_FILE_POLICY,
      kinds: {
        ...CHAT_LARGE_FILE_POLICY.kinds,
        notebook: { ...CHAT_LARGE_FILE_POLICY.kinds.notebook, maxContainers: containers - 1 },
      },
    };
    const cells = Array.from({ length: 50 }, () => codeCell('["run()\\n"]'));
    const parse = vi.spyOn(JSON, 'parse');
    try {
      const { outcome } = await notebookOutcome(cells, policy);

      expect(outcome).toBe('accepted');
      expect(parse.mock.calls.some(([text]) => String(text).includes('"cells"'))).toBe(false);
    } finally {
      parse.mockRestore();
    }
    expect(() => extractNotebookCellText(notebook(cells), policy.kinds.notebook)).toThrow(
      expect.objectContaining({ reason: 'over_kind_limit' }),
    );
    expect(() =>
      extractNotebookCellText(notebook(cells), { maxContainers: containers }),
    ).not.toThrow();
  });

  it('seals a notebook that is not JSON, whose cells preparation cannot read either', async () => {
    const { outcome } = await largeOutcome(
      textFile(1_500_000),
      { inspectContent: policyInspector('block') },
      NOTEBOOK,
    );

    expect(outcome).toBe('accepted');
  });
});
