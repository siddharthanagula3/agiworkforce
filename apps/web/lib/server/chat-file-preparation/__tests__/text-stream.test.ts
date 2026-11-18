// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { prepareChatFileStep, readPreparedCard, readPreparedText } from '..';
import { splitIntoSegments, wholeTextCut } from '../text-stream';
import {
  createCountingStorage,
  FakePreparationDb,
  prepareUntilDone,
  seededRandom,
  seededWords,
  storeSource,
  testUuid,
  USER,
  type CountingStorage,
} from './preparation-harness';

const MIB = 1024 * 1024;

function policyWith(overrides: { bytesPerStep?: number; maxTextChars?: number }) {
  return {
    ...CHAT_LARGE_FILE_POLICY,
    kinds: {
      ...CHAT_LARGE_FILE_POLICY.kinds,
      text: {
        ...CHAT_LARGE_FILE_POLICY.kinds.text,
        ...(overrides.bytesPerStep ? { bytesPerStep: overrides.bytesPerStep } : {}),
      },
    },
    preparation: {
      ...CHAT_LARGE_FILE_POLICY.preparation,
      ...(overrides.maxTextChars ? { maxTextChars: overrides.maxTextChars } : {}),
    },
  };
}

async function sealed(
  db: FakePreparationDb,
  storage: CountingStorage,
  data: Uint8Array,
  filename: string,
  mimeType: string,
) {
  const id = testUuid();
  const key = `chat-attachments/${USER}/${id}.sealed`;
  await storeSource(storage, key, data, mimeType);
  db.addAsset({
    id,
    mime_type: mimeType,
    storage_pathname: key,
    filename,
    byte_size: data.byteLength,
  });
  return id;
}

/** Multi-byte text whose 1 MiB range edges land inside code points and between CR and LF. */
function awkwardText(): string {
  const random = seededRandom(23);
  const lines: string[] = [];
  let length = 0;
  while (length < MAX_CHAT_ATTACHMENT_BYTES + 2 * MIB) {
    const line = `${seededWords(random, 5)} café 東京 😀 naïve\r\n`;
    lines.push(line);
    length += Buffer.byteLength(line, 'utf8');
  }
  return lines.join('');
}

describe('text preparation', () => {
  it('streams in ranges that never split a code point or a CRLF, and strips the BOM', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const source = awkwardText();
    const data = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(source, 'utf8')]);
    const id = await sealed(db, storage, data, 'notes.md', 'text/markdown');
    const policy = policyWith({ bytesPerStep: MIB + 1, maxTextChars: 40_000_000 });

    const steps = await prepareUntilDone(
      () => prepareChatFileStep(id, { db, storage, policy }),
      100,
    );

    expect(steps).toBeGreaterThan(20);
    const expected = source.replace(/\r\n/g, '\n');
    const text = await readPreparedText(
      id,
      { startChar: 0, maxChars: 40_000_000 },
      { userId: USER, db, storage, policy },
    );
    expect(text?.text.length).toBe(expected.length);
    expect(text?.text === expected).toBe(true);
    expect(db.rowForAsset(id)).toMatchObject({ state: 'ready' });
  });

  it('writes segments of at most the segment size', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(
      db,
      storage,
      Buffer.from(awkwardText(), 'utf8'),
      'notes.txt',
      'text/plain',
    );

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const keys = db.rowForAsset(id)!.derived_keys;
    expect(keys.length).toBeGreaterThan(1);
    for (const key of keys) {
      const stored = await storage.memory.get(storage.bucket, key);
      expect(stored!.data.byteLength).toBeLessThanOrEqual(
        CHAT_LARGE_FILE_POLICY.preparation.segmentBytes,
      );
    }
  });

  it('refuses invalid UTF-8', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x61);
    data[MIB * 3] = 0xff;
    const id = await sealed(db, storage, data, 'data.json', 'application/json');

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    expect(db.rowForAsset(id)).toMatchObject({
      state: 'prepare_failed',
      error: 'invalid_utf8',
      derived_keys: [],
    });
  });

  it('stops at the text cap and reports a partial read', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(
      db,
      storage,
      Buffer.from(awkwardText(), 'utf8'),
      'log.txt',
      'text/plain',
    );

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card).toMatchObject({
      state: 'ready_partial',
      textChars: CHAT_LARGE_FILE_POLICY.preparation.maxTextChars,
    });
    expect(card?.coverage['textTruncated']).toBe(true);
  });

  it('reads HTML as text and never renders it', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const page =
      '<html><body><script>fetch("https://example.invalid")</script><p>Quarterly plan</p></body></html>\n';
    const data = Buffer.from(
      page.repeat(Math.ceil((MAX_CHAT_ATTACHMENT_BYTES + MIB) / page.length)),
      'utf8',
    );
    const id = await sealed(db, storage, data, 'page.html', 'text/html');

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    expect(db.rowForAsset(id)).toMatchObject({ kind: 'html' });
    const text = await readPreparedText(
      id,
      { startChar: 0, maxChars: page.length },
      { userId: USER, db, storage },
    );
    expect(text?.text).toBe(page);
  });

  it('keeps notebook cell text and drops rendered outputs', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const notebook = {
      cells: [
        { cell_type: 'markdown', source: ['# Revenue model'] },
        {
          cell_type: 'code',
          source: 'print(total)',
          outputs: [
            { output_type: 'stream', text: ['4471\n'] },
            {
              output_type: 'display_data',
              data: { 'image/png': 'A'.repeat(MAX_CHAT_ATTACHMENT_BYTES + MIB) },
            },
          ],
        },
      ],
    };
    const id = await sealed(
      db,
      storage,
      Buffer.from(JSON.stringify(notebook), 'utf8'),
      'model.ipynb',
      'application/x-ipynb+json',
    );

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const text = await readPreparedText(
      id,
      { startChar: 0, maxChars: 10_000 },
      { userId: USER, db, storage },
    );
    expect(text?.text).toBe('# Revenue model\n\n```\nprint(total)\n```\n\nOutput:\n4471');
    expect(db.rowForAsset(id)).toMatchObject({ kind: 'notebook', state: 'ready' });
  });

  describe('a notebook made of more objects and arrays than its kind allows', () => {
    const notebookBytes = Buffer.from(
      JSON.stringify({
        cells: [
          { cell_type: 'markdown', source: ['say "[[{{" and \\"[{\\" and [] {}'] },
          { cell_type: 'markdown', source: ['A'.repeat(MAX_CHAT_ATTACHMENT_BYTES + MIB)] },
        ],
      }),
      'utf8',
    );

    function notebookPolicy(maxContainers: number) {
      return {
        ...CHAT_LARGE_FILE_POLICY,
        kinds: {
          ...CHAT_LARGE_FILE_POLICY.kinds,
          notebook: { ...CHAT_LARGE_FILE_POLICY.kinds.notebook, maxContainers },
        },
      };
    }

    async function prepared(maxContainers: number) {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const id = await sealed(db, storage, notebookBytes, 'deep.ipynb', 'application/x-ipynb+json');
      const policy = notebookPolicy(maxContainers);
      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy }));
      return db.rowForAsset(id);
    }

    it('is refused before it is parsed', async () => {
      const parse = vi.spyOn(JSON, 'parse');
      try {
        const row = await prepared(5);
        expect(row).toMatchObject({ state: 'prepare_failed', error: 'over_kind_limit' });
        expect(parse.mock.calls.some(([text]) => String(text).includes('"cells"'))).toBe(false);
      } finally {
        parse.mockRestore();
      }
    });

    it('counts only the six the file holds, none of the brackets written inside its strings', async () => {
      expect(await prepared(6)).toMatchObject({ kind: 'notebook', state: 'ready_partial' });
    });
  });

  it('splits segments between code points', () => {
    const text = '😀'.repeat(10);
    const segments = splitIntoSegments(text, 6);
    expect(segments.join('')).toBe(text);
    for (const segment of segments)
      expect(Buffer.byteLength(segment, 'utf8')).toBeLessThanOrEqual(6);
  });

  it('ends a mid-file range before an incomplete code point or a lone CR', () => {
    const euro = Buffer.from('ab€', 'utf8');
    expect(wholeTextCut(euro.subarray(0, 4))).toBe(2);
    expect(wholeTextCut(Buffer.from('ab\r', 'latin1'))).toBe(2);
    expect(wholeTextCut(euro)).toBe(euro.length);
  });
});
