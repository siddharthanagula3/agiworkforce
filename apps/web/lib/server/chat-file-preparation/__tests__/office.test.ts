// @vitest-environment node
import { Document, HeadingLevel, ImageRun, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type ArchiveBoundsModule = typeof import('@/lib/security/archive-bounds');

const inflated = vi.hoisted(() => [] as string[]);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security/archive-bounds', async (importOriginal) => {
  const actual = await importOriginal<ArchiveBoundsModule>();
  return {
    ...actual,
    readArchiveMember: (...args: Parameters<typeof actual.readArchiveMember>) => {
      inflated.push(args[0].name);
      return actual.readArchiveMember(...args);
    },
  };
});

import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import {
  extractOfficeDocumentText,
  OfficeDocumentUnreadableError,
} from '@/lib/server/office-document-text';
import { prepareChatFileStep, readPreparedCard, readPreparedText } from '..';
import { MAX_OUTLINE_TITLE_CHARS } from '../derived-keys';
import {
  createCountingStorage,
  FakePreparationDb,
  prepareUntilDone,
  storeSource,
  testUuid,
  USER,
  type CountingStorage,
} from './preparation-harness';

const MIB = 1024 * 1024;
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const OVER_BUDGET_BYTES = 300 * MIB;
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

beforeEach(() => {
  inflated.length = 0;
});

/** Adds an uncompressed media member, so the archive is over the inline limit on disk. */
async function withMedia(archive: Buffer, path: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(archive);
  zip.file(path, Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x5a), { compression: 'STORE' });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Rewrites the size a member's headers declare, which a zip's author controls. */
function declareMemberSize(archive: Buffer, path: string, size: number): Buffer {
  const result = Buffer.from(archive);
  const end = result.length - 22;
  expect(result.readUInt32LE(end)).toBe(0x06054b50);
  let offset = result.readUInt32LE(end + 16);
  while (result.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = result.readUInt16LE(offset + 28);
    const extraLength = result.readUInt16LE(offset + 30);
    const commentLength = result.readUInt16LE(offset + 32);
    const name = result.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === path) {
      const localOffset = result.readUInt32LE(offset + 42);
      expect(result.readUInt32LE(localOffset)).toBe(0x04034b50);
      result.writeUInt32LE(size, offset + 24);
      result.writeUInt32LE(size, localOffset + 22);
      return result;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Fixture member missing: ${path}`);
}

async function buildDocx(extra: readonly Paragraph[] = []): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Background', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'The onboarding owner is Marisol Trent.' }),
          new Paragraph({ text: 'Vendors', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Ridgeway Labs serves APAC.' }),
          ...extra,
        ],
      },
    ],
  });
  return withMedia(await Packer.toBuffer(document), 'word/media/scan.bin');
}

async function buildPptx(
  slides: readonly string[],
  editFirstSlide?: (xml: string) => string,
): Promise<Buffer> {
  const presentation = new PptxGenJS();
  for (const text of slides) presentation.addSlide().addText(text, { x: 1, y: 1, w: 8, h: 1 });
  let output = (await presentation.write({ outputType: 'nodebuffer' })) as Buffer;
  if (editFirstSlide) {
    const zip = await JSZip.loadAsync(output);
    const path = 'ppt/slides/slide1.xml';
    zip.file(path, editFirstSlide(await zip.file(path)!.async('string')));
    output = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
  return withMedia(output, 'ppt/media/recording.bin');
}

async function sealed(
  db: FakePreparationDb,
  storage: CountingStorage,
  data: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
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

describe('Office document preparation', () => {
  it('reads a DOCX from its text parts and keeps its headings as an outline', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(db, storage, await buildDocx(), 'brief.docx', DOCX_TYPE);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const text = (await readPreparedText(
      id,
      { startChar: 0, maxChars: 10_000 },
      { userId: USER, db, storage },
    ))!.text;
    expect(text).toBe(
      '# Background\nThe onboarding owner is Marisol Trent.\n## Vendors\nRidgeway Labs serves APAC.',
    );
    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card).toMatchObject({ kind: 'office', state: 'ready' });
    expect(card?.outline).toEqual([
      { title: 'Background', level: 0, char: 0 },
      { title: 'Vendors', level: 1, char: text.indexOf('## Vendors') },
    ]);
    expect(inflated).not.toContain('word/media/scan.bin');
  });

  it('reads a DOCX that holds a real picture without opening its media member', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const picture = new Paragraph({
      children: [
        new ImageRun({ type: 'png', data: PIXEL_PNG, transformation: { width: 8, height: 8 } }),
      ],
    });
    const data = await buildDocx([
      picture,
      new Paragraph({ text: 'Closing note after the picture.' }),
    ]);
    const zip = await JSZip.loadAsync(data);
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
    expect(media.length).toBeGreaterThan(1);
    const id = await sealed(db, storage, data, 'brief.docx', DOCX_TYPE);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const card = await readPreparedCard(id, { userId: USER, db, storage });
    expect(card).toMatchObject({ kind: 'office', state: 'ready' });
    const text = (await readPreparedText(
      id,
      { startChar: 0, maxChars: 10_000 },
      { userId: USER, db, storage },
    ))!.text;
    expect(text).toContain('The onboarding owner is Marisol Trent.');
    expect(text).toContain('Closing note after the picture.');
    expect(inflated.some((name) => name.startsWith('word/media/'))).toBe(false);
  });

  it('caps the title of a heading it keeps in the outline', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const heading = 'Appendix '.repeat(400).trim();
    const data = await buildDocx([
      new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }),
    ]);
    const id = await sealed(db, storage, data, 'brief.docx', DOCX_TYPE);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    const anchor = (await readPreparedCard(id, { userId: USER, db, storage }))?.outline[2];
    expect(anchor?.title.length).toBeLessThanOrEqual(MAX_OUTLINE_TITLE_CHARS);
    expect(anchor?.title.length).toBeGreaterThan(MAX_OUTLINE_TITLE_CHARS - 'Appendix '.length);
    expect(heading.startsWith(anchor!.title)).toBe(true);
  });

  it('refuses a DOCX whose text parts declare more than the budget before inflating anything', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = declareMemberSize(await buildDocx(), 'word/document.xml', OVER_BUDGET_BYTES);
    const id = await sealed(db, storage, data, 'brief.docx', DOCX_TYPE);

    const result = await prepareChatFileStep(id, { db, storage });

    expect(result).toEqual({ outcome: 'finished', state: 'prepare_failed', done: true });
    expect(db.rowForAsset(id)).toMatchObject({ error: 'archive_bomb', derived_keys: [] });
    expect(inflated).toEqual([]);
  });

  it('reads a PPTX whose media declare more than the budget while its text does not', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = declareMemberSize(
      await buildPptx(['Launch Readiness', 'The blocker is WALNUT-7742-ECHO']),
      'ppt/media/recording.bin',
      OVER_BUDGET_BYTES,
    );
    const id = await sealed(db, storage, data, 'deck.pptx', PPTX_TYPE);

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    expect(db.rowForAsset(id)).toMatchObject({ kind: 'office', state: 'ready' });
    const text = (await readPreparedText(
      id,
      { startChar: 0, maxChars: 10_000 },
      { userId: USER, db, storage },
    ))!.text;
    expect(text).toBe(
      '## Slide 1\nLaunch Readiness\n\n## Slide 2\nThe blocker is WALNUT-7742-ECHO',
    );
    expect(inflated).not.toContain('ppt/media/recording.bin');

    await expect(extractOfficeDocumentText(data, 'deck.pptx', 'pptx')).rejects.toMatchObject({
      constructor: OfficeDocumentUnreadableError,
      reason: 'archive_bomb',
    });
  });

  it('reads no more slides than the policy allows', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(
      db,
      storage,
      await buildPptx(['First', 'Second', 'Third']),
      'deck.pptx',
      PPTX_TYPE,
    );
    const policy = {
      ...CHAT_LARGE_FILE_POLICY,
      kinds: {
        ...CHAT_LARGE_FILE_POLICY.kinds,
        office: { ...CHAT_LARGE_FILE_POLICY.kinds.office, maxSlides: 2 },
      },
    };

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy }));

    const text = (await readPreparedText(
      id,
      { startChar: 0, maxChars: 10_000 },
      { userId: USER, db, storage, policy },
    ))!.text;
    expect(text).toBe('## Slide 1\nFirst\n\n## Slide 2\nSecond');
    const card = await readPreparedCard(id, { userId: USER, db, storage, policy });
    expect(card?.state).toBe('ready_partial');
    expect(card?.coverage['slidesOmitted']).toBe(1);
  });

  it('finishes a deck within the slide cap as ready', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(
      db,
      storage,
      await buildPptx(['First', 'Second']),
      'deck.pptx',
      PPTX_TYPE,
    );
    const policy = {
      ...CHAT_LARGE_FILE_POLICY,
      kinds: {
        ...CHAT_LARGE_FILE_POLICY.kinds,
        office: { ...CHAT_LARGE_FILE_POLICY.kinds.office, maxSlides: 2 },
      },
    };

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage, policy }));

    const card = await readPreparedCard(id, { userId: USER, db, storage, policy });
    expect(card?.state).toBe('ready');
    expect(card?.coverage['slidesOmitted']).toBeUndefined();
  });

  it('refuses a PPTX character reference outside Unicode as unreadable instead of retrying it', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const data = await buildPptx(['MARKER'], (xml) => xml.replace('MARKER', '&#x110000;'));
    const id = await sealed(db, storage, data, 'deck.pptx', PPTX_TYPE);

    const result = await prepareChatFileStep(id, { db, storage });

    expect(result).toEqual({ outcome: 'finished', state: 'prepare_failed', done: true });
    expect(db.rowForAsset(id)).toMatchObject({ error: 'unreadable', derived_keys: [] });
  });

  it(
    'reads past unclosed paragraph and run openers on a slide in time linear in the XML',
    { timeout: 60_000 },
    async () => {
      const db = new FakePreparationDb();
      const storage = createCountingStorage();
      const openers = 60_000;
      const data = await buildPptx(['Launch Readiness'], (xml) =>
        xml.replace(
          '</p:sld>',
          `<a:p>${'<a:t>'.repeat(openers)}</a:p>${'<a:p>'.repeat(openers)}</p:sld>`,
        ),
      );
      const id = await sealed(db, storage, data, 'deck.pptx', PPTX_TYPE);

      const started = performance.now();
      await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));
      const elapsed = performance.now() - started;

      expect(db.rowForAsset(id)).toMatchObject({ state: 'ready' });
      const text = (await readPreparedText(
        id,
        { startChar: 0, maxChars: 10_000 },
        { userId: USER, db, storage },
      ))!.text;
      expect(text).toBe('## Slide 1\nLaunch Readiness');
      expect(elapsed).toBeLessThan(2_000);
    },
  );

  it('gives prepare_failed for an archive that is not a document', async () => {
    const db = new FakePreparationDb();
    const storage = createCountingStorage();
    const id = await sealed(
      db,
      storage,
      Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + MIB, 0x20),
      'brief.docx',
      DOCX_TYPE,
    );

    await prepareUntilDone(() => prepareChatFileStep(id, { db, storage }));

    expect(db.rowForAsset(id)).toMatchObject({ state: 'prepare_failed', error: 'unreadable' });
  });
});
