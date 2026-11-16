import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlanMaxAttachmentsPerMessage } from '@agiworkforce/types';

type MediaAssetsModule = typeof import('@/lib/server/media-assets');
type MediaStorageModule = typeof import('@/lib/server/media-storage');
type SchemaModule = typeof import('@/lib/server/chat-file-intake/schema');

const mocks = vi.hoisted(() => ({
  getMediaAssetById: vi.fn(),
  readStoredMedia: vi.fn(),
  deleteStoredMedia: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<MediaAssetsModule>()),
  getMediaAssetById: mocks.getMediaAssetById,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<MediaStorageModule>()),
  readStoredMedia: mocks.readStoredMedia,
  deleteStoredMedia: mocks.deleteStoredMedia,
}));
vi.mock('@/lib/server/chat-file-intake/schema', async (importOriginal) => {
  const actual = await importOriginal<SchemaModule>();
  return {
    ...actual,
    chatFileSchemaReady: (db: Parameters<typeof actual.chatFileSchemaReady>[0]) =>
      actual.chatFileSchemaReady(db),
  };
});

import {
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
} from '@/lib/chat-attachment-policy';
import { logger } from '@/lib/logger';
import { createSchemaAbsentDb } from '@/lib/server/chat-file-intake/__tests__/schema-absent-db';
import {
  BUCKET,
  FakePreparationDb,
  USER,
  createCountingStorage,
  type CountingStorage,
} from '@/lib/server/chat-file-preparation/__tests__/preparation-harness';
import {
  outlineKey,
  preparationKeyPrefix,
  serializeOutline,
  textSegmentKey,
  type PreparedOutlineAnchor,
} from '@/lib/server/chat-file-preparation/derived-keys';
import type { PreparationDb } from '@/lib/server/chat-file-preparation/progress-store';
import { OPEN_FILE_TOOL_NAME } from '@/lib/server/tools/file-search-tool';
import {
  LARGE_FILE_CARD_DETAIL_KEY,
  LARGE_FILE_CARD_KEY,
  LARGE_FILE_PARTIAL_READ_LINE,
  LARGE_FILE_TEXT_KEY,
  applyAttachmentTurnStep,
  attachmentPartTokens,
  cardMarkerOf,
  estimateAttachmentTokens,
  renderLargeFileCard,
  type LedgerMessage,
} from './attachment-turn-budget';
import { hydrateChatAttachments } from './chat-attachment-hydration';
import {
  appendLargeFileText,
  attachmentAssetIdsOf,
  createPreparedAttachmentResolver,
  resolveLargeFileStorageFiles,
  type PreparedAttachmentResolverDeps,
} from './prepared-attachments';

const MAX_ATTACHMENTS = getPlanMaxAttachmentsPerMessage('pro');
const LARGE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_LARGE_ID = '22222222-2222-4222-8222-222222222222';
const SMALL_ID = '33333333-3333-4333-8333-333333333333';
const HISTORY_ID = '44444444-4444-4444-8444-444444444444';
const OVER_BUDGET_NOTE = 'was left out because this conversation has reached its attachment limit.';

interface AssetFixture {
  byteSize: number | null;
  mimeType: string;
  filename: string;
  stored?: Buffer;
  pathname?: string;
  source?: string;
}

type Part = Record<string, unknown> & { type: string; text?: string };
type Message = { role: string; content: string | Part[] };

let assets: Map<string, AssetFixture>;

function asset(id: string, fixture: AssetFixture): string {
  assets.set(id, fixture);
  return id;
}

function fileRef(id: string): Part {
  return { type: 'file', file: { asset_id: id } };
}

function partsOf(message: Message | undefined): Part[] {
  return (message?.content ?? []) as Part[];
}

function largeAsset(id: string, filename = 'ledger.csv'): string {
  return asset(id, { byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1, mimeType: 'text/csv', filename });
}

async function seedPreparation(
  prep: FakePreparationDb,
  storage: CountingStorage,
  assetId: string,
  options: { text: string; state?: string; kind?: string; outline?: PreparedOutlineAnchor[] },
): Promise<void> {
  const prefix = preparationKeyPrefix(USER, assetId, 1);
  const segmentKey = textSegmentKey(prefix, 1);
  await storage.memory.put({
    bucket: BUCKET,
    key: segmentKey,
    body: Buffer.from(options.text, 'utf8'),
    contentType: 'text/plain',
  });
  const derivedKeys = [segmentKey];
  if (options.outline) {
    const key = outlineKey(prefix);
    await storage.memory.put({
      bucket: BUCKET,
      key,
      body: Buffer.from(serializeOutline(options.outline), 'utf8'),
      contentType: 'application/json',
    });
    derivedKeys.push(key);
  }
  prep.rows.set(`row-${assetId}`, {
    id: `row-${assetId}`,
    media_asset_id: assetId,
    user_id: USER,
    organization_id: null,
    kind: options.kind ?? 'text',
    state: options.state ?? 'ready',
    preparer_version: 1,
    cursor: {},
    segments_ready: options.text ? 1 : 0,
    pages_read: 0,
    page_count: null,
    sheet_count: null,
    indexed_chars: String(options.text.length),
    derived_keys: derivedKeys,
    coverage: {
      segmentChars: options.text ? [options.text.length] : [],
      textChars: options.text.length,
    },
    error: options.state === 'prepare_failed' ? 'unreadable' : null,
    updated_at: new Date(),
  });
}

function resolverFor(
  prep: Pick<FakePreparationDb, 'query'>,
  storage: CountingStorage,
  overrides: Partial<PreparedAttachmentResolverDeps> = {},
) {
  return createPreparedAttachmentResolver({
    db: prep,
    userId: USER,
    storage,
    temporaryChat: false,
    query: 'What is the total for March?',
    ...overrides,
  });
}

async function hydrate(
  messages: Message[],
  resolver?: ReturnType<typeof createPreparedAttachmentResolver>,
) {
  return hydrateChatAttachments(
    messages as Parameters<typeof hydrateChatAttachments>[0],
    USER,
    undefined,
    MAX_ATTACHMENTS,
    null,
    resolver ? { resolveOversizeAttachment: resolver.resolve } : {},
  );
}

function cardText(message: Message | undefined): string {
  const card = partsOf(message).find((part) => part[LARGE_FILE_CARD_KEY] !== undefined);
  return card?.text ?? '';
}

describe('createPreparedAttachmentResolver', () => {
  const originalFlag = process.env['CHAT_LARGE_FILES_ENABLED'];

  beforeEach(() => {
    vi.clearAllMocks();
    assets = new Map();
    mocks.getMediaAssetById.mockImplementation(async (id: string) => {
      const fixture = assets.get(id);
      if (!fixture) return null;
      return {
        id,
        userId: USER,
        organizationId: null,
        kind: 'file',
        mimeType: fixture.mimeType,
        byteSize: fixture.byteSize,
        storageUrl: `https://files.example.test/${id}`,
        storagePathname: fixture.pathname ?? `chat-attachments/${USER}/${id}`,
        metadata: {
          filename: fixture.filename,
          ...(fixture.source ? { source: fixture.source } : {}),
        },
        deletedAt: null,
      };
    });
    mocks.readStoredMedia.mockImplementation(async (pathname: string) => {
      const id = pathname.split('/').pop() ?? '';
      const fixture = assets.get(id);
      if (!fixture?.stored) return null;
      return { data: fixture.stored, contentType: fixture.mimeType };
    });
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env['CHAT_LARGE_FILES_ENABLED'];
    else process.env['CHAT_LARGE_FILES_ENABLED'] = originalFlag;
  });

  it('chooses the prepared path by size with the flag off, and never reads the large object', async () => {
    delete process.env['CHAT_LARGE_FILES_ENABLED'];
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    await storage.memory.put({
      bucket: BUCKET,
      key: `chat-attachments/${USER}/${LARGE_ID}`,
      body: Buffer.alloc(64),
      contentType: 'text/csv',
    });
    await seedPreparation(prep, storage, LARGE_ID, { text: 'month,total\nMarch,1200\n' });
    const resolver = resolverFor(prep, storage);
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Total?' }, fileRef(LARGE_ID)] },
    ];

    await hydrate(messages, resolver);

    expect(cardText(messages[0])).toContain(`[attached file: ledger.csv (text/csv), `);
    expect(cardText(messages[0])).toContain(`id ${LARGE_ID}`);
    expect(resolver.largeFiles()).toEqual([
      expect.objectContaining({
        assetId: LARGE_ID,
        live: true,
        byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      }),
    ]);
    expect(resolver.textSections()).toEqual([
      { assetId: LARGE_ID, filename: 'ledger.csv', live: true, text: 'month,total\nMarch,1200\n' },
    ]);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
    expect(storage.stats.reads).toBe(0);
  });

  it('with only small files and a history over the inline budget, the provider messages equal the default resolver', async () => {
    asset(SMALL_ID, {
      byteSize: 5,
      mimeType: 'text/plain',
      filename: 'notes.txt',
      stored: Buffer.from('hello'),
    });
    asset(HISTORY_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES - 1,
      mimeType: 'text/plain',
      filename: 'old.txt',
    });
    const conversation = (): Message[] => [
      { role: 'user', content: [fileRef(HISTORY_ID)] },
      { role: 'assistant', content: 'Read it.' },
      { role: 'user', content: [{ type: 'text', text: 'And this?' }, fileRef(SMALL_ID)] },
    ];
    const prep = new FakePreparationDb();
    const resolver = resolverFor(prep, createCountingStorage());
    const today = conversation();
    const withResolver = conversation();

    const todayStaged = await hydrate(today);
    const staged = await hydrate(withResolver, resolver);

    expect(withResolver).toEqual(today);
    expect(staged).toEqual(todayStaged);
    expect(partsOf(withResolver[0])).toEqual([
      { type: 'text', text: `[attachment unavailable: old.txt ${OVER_BUDGET_NOTE}]` },
    ]);
    expect(resolver.largeFiles()).toEqual([]);
    expect(prep.statements).toEqual([]);
  });

  it("a history image over the inline budget gets today's over_budget note", async () => {
    asset(SMALL_ID, {
      byteSize: 5,
      mimeType: 'text/plain',
      filename: 'notes.txt',
      stored: Buffer.from('hello'),
    });
    asset(HISTORY_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES - 1,
      mimeType: 'image/png',
      filename: 'chart.png',
    });
    const messages: Message[] = [
      { role: 'user', content: [fileRef(HISTORY_ID)] },
      { role: 'assistant', content: 'Seen.' },
      { role: 'user', content: [fileRef(SMALL_ID)] },
    ];

    await hydrate(messages, resolverFor(new FakePreparationDb(), createCountingStorage()));

    expect(partsOf(messages[0])).toEqual([
      { type: 'text', text: `[attachment unavailable: chart.png ${OVER_BUDGET_NOTE}]` },
    ]);
  });

  it("a current-turn small file over the inline budget gets today's 413", async () => {
    asset(SMALL_ID, {
      byteSize: 5,
      mimeType: 'text/plain',
      filename: 'notes.txt',
      stored: Buffer.from('hello'),
    });
    asset(HISTORY_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES - 1,
      mimeType: 'text/plain',
      filename: 'second.txt',
    });
    const messages: Message[] = [
      { role: 'user', content: [fileRef(SMALL_ID), fileRef(HISTORY_ID)] },
    ];

    await expect(
      hydrate(messages, resolverFor(new FakePreparationDb(), createCountingStorage())),
    ).rejects.toMatchObject({ status: 413, code: 'attachment_context_too_large' });
  });

  it.each([
    { label: 'prepare_failed', seed: true },
    { label: 'a missing preparation row', seed: false },
  ])('$label gives the card only and does not raise the truncation header', async ({ seed }) => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    if (seed) await seedPreparation(prep, storage, LARGE_ID, { text: '', state: 'prepare_failed' });
    const onTruncated = vi.fn();
    const resolver = resolverFor(prep, storage, { onTruncated });
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolver);

    expect(partsOf(messages[0])).toHaveLength(1);
    expect(cardText(messages[0])).toContain('This file could not be read as text.');
    expect(resolver.textSections()).toEqual([]);
    expect(onTruncated).not.toHaveBeenCalled();
  });

  it('a file whose preparation cannot be read gives the card only and does not raise the truncation header', async () => {
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    const failing = new FakePreparationDb();
    const prep = {
      query: async (sql: string, params?: unknown[]) => {
        if (/chat_file_preparations/.test(sql) && !/to_regclass/.test(sql)) {
          throw new Error('connection reset');
        }
        return failing.query(sql, params);
      },
    } as Pick<FakePreparationDb, 'query'>;
    const onTruncated = vi.fn();
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolverFor(prep, storage, { onTruncated }));

    expect(cardText(messages[0])).toContain('This file could not be read as text.');
    expect(onTruncated).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'prepare_failed', seed: true },
    { label: 'a missing preparation row', seed: false },
  ])(
    '$label never sends the model to the file tools or asks for a partial-read answer',
    async ({ seed }) => {
      const prep = new FakePreparationDb();
      const storage = createCountingStorage();
      largeAsset(LARGE_ID);
      if (seed)
        await seedPreparation(prep, storage, LARGE_ID, { text: '', state: 'prepare_failed' });
      const resolver = resolverFor(prep, storage);
      const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

      await hydrate(messages, resolver);

      const marker = cardMarkerOf(partsOf(messages[0])[0])!;
      const rendered = renderLargeFileCard(marker, { oneLine: false, fileToolsOffered: true });
      expect(rendered).toContain('This file could not be read as text.');
      expect(rendered).not.toContain(OPEN_FILE_TOOL_NAME);
      expect(rendered).not.toContain(LARGE_FILE_PARTIAL_READ_LINE);
    },
  );

  it('an outline longer than the card still reaches the model within cardMaxTokens', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID, 'annual-report.pdf');
    const outline = Array.from({ length: 100 }, (_, index) => ({
      title: `Section ${index + 1}: regional revenue, costs and headcount by quarter`,
      level: 1 + (index % 3),
      page: index * 4 + 1,
    }));
    await seedPreparation(prep, storage, LARGE_ID, { text: 'Opening summary.', outline });
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolverFor(prep, storage));

    const parts = partsOf(messages[0]);
    const detail = parts.find((part) => part[LARGE_FILE_CARD_DETAIL_KEY] !== undefined);
    expect(detail).toBeDefined();
    const detailTokens = attachmentPartTokens(detail);
    expect(detailTokens).toBeGreaterThan(0);
    const marker = cardMarkerOf(parts[0])!;
    const fullestCard = renderLargeFileCard(
      { ...marker, partial: true },
      { oneLine: false, fileToolsOffered: true },
    );
    expect(estimateAttachmentTokens(fullestCard) + detailTokens).toBeLessThanOrEqual(
      CHAT_LARGE_FILE_POLICY.turnBudget.cardMaxTokens,
    );
    const detailText = (detail as unknown as { [LARGE_FILE_CARD_DETAIL_KEY]: { text: string } })[
      LARGE_FILE_CARD_DETAIL_KEY
    ].text;
    expect(detailText).toContain('Section 1: regional revenue');
  });

  it('a file attached in an earlier turn and again in this one sends one text, never more than it charges', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    const text = 'month,total\n'.concat('March,1200\n'.repeat(16_000));
    await seedPreparation(prep, storage, LARGE_ID, { text });
    const resolver = resolverFor(prep, storage);
    const messages: Message[] = [
      { role: 'user', content: [fileRef(LARGE_ID)] },
      { role: 'assistant', content: 'Read it.' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'And the March total?' }, fileRef(LARGE_ID)],
      },
    ];

    await hydrate(messages, resolver);
    appendLargeFileText(
      messages as Parameters<typeof appendLargeFileText>[0],
      resolver.textSections(),
    );

    expect(resolver.textSections()).toEqual([
      expect.objectContaining({ assetId: LARGE_ID, live: true }),
    ]);
    const ledgerMessages: LedgerMessage[] = messages.map((message) => {
      const parts = typeof message.content === 'string' ? null : message.content;
      return {
        role: message.role,
        content: parts
          ? parts.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('\n')
          : (message.content as string),
        ...(parts ? { multimodal_content: parts } : {}),
      };
    });
    const state = {
      limitTokens: CHAT_LARGE_FILE_POLICY.turnBudget.maxAttachmentTokensPerTurn,
      charged: 0,
      readingClosed: false,
      fileToolsOffered: true,
    };

    applyAttachmentTurnStep(ledgerMessages, state);

    const sent = ledgerMessages.reduce(
      (total, message) =>
        total +
        (message.multimodal_content ?? []).reduce(
          (sum: number, part) => sum + attachmentPartTokens(part),
          0,
        ),
      0,
    );
    expect(sent).toBeGreaterThan(0);
    expect(sent).toBeLessThanOrEqual(state.charged);
  });

  it('a large row from another inserter is handled as today, not as a sealed chat file', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    asset(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'export.csv',
      pathname: `generated-files/${USER}/${LARGE_ID}`,
      source: 'generated-file',
    });
    await seedPreparation(prep, storage, LARGE_ID, { text: 'month,total\n' });
    const resolver = resolverFor(prep, storage);
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await expect(hydrate(messages, resolver)).rejects.toMatchObject({
      status: 413,
      code: 'attachment_context_too_large',
    });
    expect(resolver.largeFiles()).toEqual([]);
  });

  it('a large row marked as a chat attachment by its metadata takes the prepared path', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    asset(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'ledger.csv',
      pathname: `uploads/${USER}/${LARGE_ID}`,
      source: 'chat-attachment',
    });
    await seedPreparation(prep, storage, LARGE_ID, { text: 'month,total\n' });
    const resolver = resolverFor(prep, storage);
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolver);

    expect(resolver.largeFiles()).toEqual([expect.objectContaining({ assetId: LARGE_ID })]);
  });

  it('hands the model prepared text without a NUL character', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    await seedPreparation(prep, storage, LARGE_ID, { text: 'month,\u0000total\nMarch,99\n' });
    const resolver = resolverFor(prep, storage);
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolver);

    const sections = resolver.textSections();
    expect(sections).toHaveLength(1);
    expect(sections[0]!.text).toContain('month,total');
    expect(sections[0]!.text).not.toContain('\u0000');
    expect(sections[0]!.text.isWellFormed()).toBe(true);
  });

  it("never reads another person's preparation of the asset", async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    const text = 'month,total\nMarch,99\n';
    await seedPreparation(prep, storage, LARGE_ID, { text });
    const otherKey = textSegmentKey(preparationKeyPrefix('someone-else', LARGE_ID, 1), 1);
    await storage.memory.put({
      bucket: BUCKET,
      key: otherKey,
      body: Buffer.from(text, 'utf8'),
      contentType: 'text/plain',
    });
    const row = prep.rows.get(`row-${LARGE_ID}`)!;
    row['user_id'] = 'someone-else';
    row.derived_keys = [otherKey];
    const resolver = resolverFor(prep, storage);
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolver);

    expect(cardText(messages[0])).toContain('This file could not be read as text.');
    expect(resolver.textSections()).toEqual([]);
  });

  it('a schema check that fails is logged and the large file is refused as today', async () => {
    largeAsset(LARGE_ID);
    const warn = vi.spyOn(logger, 'warn');
    const failing = {
      query: vi.fn(async () => {
        throw new Error('connection reset');
      }),
    };
    const resolver = resolverFor(failing as unknown as PreparationDb, createCountingStorage());
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await expect(hydrate(messages, resolver)).rejects.toMatchObject({
      status: 413,
      code: 'attachment_context_too_large',
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('schema check failed'),
    );
    warn.mockRestore();
  });

  it("a turn with only small files against the schema-absent database is today's", async () => {
    asset(SMALL_ID, {
      byteSize: 5,
      mimeType: 'text/plain',
      filename: 'notes.txt',
      stored: Buffer.from('hello'),
    });
    const unreachable = {
      query: vi.fn(async () => {
        throw new Error('no statement expected');
      }),
    };
    const resolver = resolverFor(createSchemaAbsentDb(unreachable), createCountingStorage());
    const today: Message[] = [{ role: 'user', content: [fileRef(SMALL_ID)] }];
    const withResolver: Message[] = [{ role: 'user', content: [fileRef(SMALL_ID)] }];

    await hydrate(today);
    await hydrate(withResolver, resolver);

    expect(withResolver).toEqual(today);
    expect(unreachable.query).not.toHaveBeenCalled();
  });

  it('a large file against the schema-absent database is refused as today', async () => {
    largeAsset(LARGE_ID);
    const unreachable = {
      query: vi.fn(async () => {
        throw new Error('no statement expected');
      }),
    };
    const resolver = resolverFor(createSchemaAbsentDb(unreachable), createCountingStorage());
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await expect(hydrate(messages, resolver)).rejects.toMatchObject({
      status: 413,
      code: 'attachment_context_too_large',
    });
    expect(resolver.largeFiles()).toEqual([]);
    expect(unreachable.query).not.toHaveBeenCalled();
  });

  it('a file still preparing reports a partial read through onTruncated', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    await seedPreparation(prep, storage, LARGE_ID, { text: 'first rows only', state: 'preparing' });
    const onTruncated = vi.fn();
    const resolver = resolverFor(prep, storage, { onTruncated });
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolver);

    expect(onTruncated).toHaveBeenCalledWith('ledger.csv');
    expect(cardText(messages[0])).toContain('Still reading the rest of the file.');
    expect(resolver.textSections()[0]?.text).toBe('first rows only');
  });

  it.each([
    { label: 'a prepared file with no text', state: 'ready' },
    { label: 'a file read in part with no text', state: 'ready_partial' },
  ])('$label does not raise the truncation header', async ({ state }) => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    await seedPreparation(prep, storage, LARGE_ID, { text: '', state });
    const onTruncated = vi.fn();
    const resolver = resolverFor(prep, storage, { onTruncated });
    const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

    await hydrate(messages, resolver);

    expect(onTruncated).not.toHaveBeenCalled();
    expect(cardText(messages[0])).toContain('Text read: 0 characters.');
    expect(resolver.textSections()).toEqual([]);
  });

  it('a file still preparing with no text yet reports a partial read through onTruncated', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    await seedPreparation(prep, storage, LARGE_ID, { text: '', state: 'preparing' });
    const onTruncated = vi.fn();

    await hydrate(
      [{ role: 'user', content: [fileRef(LARGE_ID)] }],
      resolverFor(prep, storage, { onTruncated }),
    );

    expect(onTruncated).toHaveBeenCalledWith('ledger.csv');
  });

  it('a history file read in part does not raise the truncation header', async () => {
    const prep = new FakePreparationDb();
    const storage = createCountingStorage();
    largeAsset(LARGE_ID);
    asset(SMALL_ID, {
      byteSize: 5,
      mimeType: 'text/plain',
      filename: 'notes.txt',
      stored: Buffer.from('hello'),
    });
    await seedPreparation(prep, storage, LARGE_ID, { text: 'first rows only', state: 'preparing' });
    const onTruncated = vi.fn();
    const messages: Message[] = [
      { role: 'user', content: [fileRef(LARGE_ID)] },
      { role: 'assistant', content: 'Read.' },
      { role: 'user', content: [fileRef(SMALL_ID)] },
    ];

    await hydrate(messages, resolverFor(prep, storage, { onTruncated }));

    expect(onTruncated).not.toHaveBeenCalled();
  });

  it('a long file gets keyword passages outside a temporary chat and none inside one', async () => {
    const maxChars = Math.floor(
      (CHAT_LARGE_FILE_POLICY.turnBudget.maxAttachmentTokensPerTurn / 2) * 3.5,
    );
    const text = 'x'.repeat(maxChars + 10);
    for (const temporaryChat of [false, true]) {
      const prep = new FakePreparationDb();
      const storage = createCountingStorage();
      largeAsset(LARGE_ID);
      await seedPreparation(prep, storage, LARGE_ID, { text });
      const searchPassages = vi.fn(async () => ['March total 1200']);
      const resolver = resolverFor(prep, storage, { temporaryChat, searchPassages });
      const messages: Message[] = [{ role: 'user', content: [fileRef(LARGE_ID)] }];

      await hydrate(messages, resolver);

      const section = resolver.textSections()[0]!;
      if (temporaryChat) {
        expect(searchPassages).not.toHaveBeenCalled();
        expect(section.text).not.toContain('March total 1200');
        expect(cardText(messages[0])).toContain('Its text is not searchable.');
      } else {
        expect(searchPassages).toHaveBeenCalledWith({
          assetId: LARGE_ID,
          query: 'What is the total for March?',
          limit: CHAT_LARGE_FILE_POLICY.turnBudget.passageWindows,
        });
        expect(section.text).toContain('[1] March total 1200');
      }
      expect(section.text.length).toBeLessThanOrEqual(maxChars + 200);
    }
  });
});

describe('appendLargeFileText and attachmentAssetIdsOf', () => {
  it('puts each prepared text on the last user message as a marked text file', () => {
    const messages: Message[] = [
      { role: 'user', content: [fileRef(LARGE_ID)] },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'and now?' },
    ];
    const ids = attachmentAssetIdsOf(messages as Parameters<typeof attachmentAssetIdsOf>[0]);

    appendLargeFileText(messages as Parameters<typeof appendLargeFileText>[0], [
      { assetId: LARGE_ID, filename: 'ledger.csv', live: false, text: 'rows' },
    ]);

    expect(ids).toEqual([LARGE_ID]);
    const last = partsOf(messages[2]);
    expect(last[0]).toEqual({ type: 'text', text: 'and now?' });
    expect(last[1]).toMatchObject({ type: 'file', [LARGE_FILE_TEXT_KEY]: { assetId: LARGE_ID } });
  });
});

describe('resolveLargeFileStorageFiles', () => {
  function storageDb(rows: Record<string, unknown>[]) {
    const prep = new FakePreparationDb();
    const statements: { sql: string; params: unknown[] }[] = [];
    const query = async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (/to_regclass/.test(sql)) return prep.query(sql, params);
      return rows;
    };
    return { statements, db: { query } as unknown as PreparationDb };
  }

  it('keeps only owned rows above the inline limit and asks with the owner', async () => {
    const { db, statements } = storageDb([
      {
        id: LARGE_ID,
        mime_type: 'text/csv',
        byte_size: String(MAX_CHAT_ATTACHMENT_BYTES + 1),
        storage_pathname: 'chat-attachments/large',
        file_name: 'ledger.csv',
        source: 'chat-attachment',
        scan_verified: true,
      },
      {
        id: SMALL_ID,
        mime_type: 'text/plain',
        byte_size: 5,
        storage_pathname: 'chat-attachments/small',
        file_name: 'notes.txt',
        source: 'chat-attachment',
        scan_verified: true,
      },
    ]);

    const files = await resolveLargeFileStorageFiles(db, { userId: USER, organizationId: null }, [
      LARGE_ID,
      SMALL_ID,
      SECOND_LARGE_ID,
    ]);

    expect(files).toEqual([
      {
        assetId: LARGE_ID,
        filename: 'ledger.csv',
        mimeType: 'text/csv',
        byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
        key: 'chat-attachments/large',
      },
    ]);
    const lookup = statements.find((entry) => entry.sql.includes('public.media_assets'));
    expect(lookup?.params).toEqual([
      [LARGE_ID, SMALL_ID, SECOND_LARGE_ID],
      USER,
      null,
      'chat-attachment',
      'chat-attachments/',
    ]);
    expect(lookup?.sql).toContain('user_id = $2');
  });

  it('refuses a large row that is not a chat file', async () => {
    const large = String(MAX_CHAT_ATTACHMENT_BYTES + 1);
    const { db, statements } = storageDb([
      {
        id: LARGE_ID,
        mime_type: 'text/csv',
        byte_size: large,
        storage_pathname: 'generated-files/export',
        file_name: 'export.csv',
        source: 'generated-file',
        scan_verified: true,
      },
      {
        id: HISTORY_ID,
        mime_type: 'text/csv',
        byte_size: large,
        storage_pathname: 'uploads/marked',
        file_name: 'marked.csv',
        source: 'chat-attachment',
        scan_verified: true,
      },
    ]);

    const files = await resolveLargeFileStorageFiles(db, { userId: USER, organizationId: null }, [
      LARGE_ID,
      HISTORY_ID,
    ]);

    expect(files.map((file) => file.assetId)).toEqual([HISTORY_ID]);
    const lookup = statements.find((entry) => entry.sql.includes('public.media_assets'));
    expect(lookup?.sql).toContain("metadata->>'source'");
  });

  it('refuses a large chat file whose scan verdict does not match its content', async () => {
    const large = String(MAX_CHAT_ATTACHMENT_BYTES + 1);
    const { db, statements } = storageDb([
      {
        id: LARGE_ID,
        mime_type: 'text/csv',
        byte_size: large,
        storage_pathname: 'chat-attachments/unscanned',
        file_name: 'unscanned.csv',
        source: 'chat-attachment',
        scan_verified: false,
      },
      {
        id: HISTORY_ID,
        mime_type: 'text/csv',
        byte_size: large,
        storage_pathname: 'chat-attachments/no-verdict',
        file_name: 'no-verdict.csv',
        source: 'chat-attachment',
        scan_verified: null,
      },
      {
        id: SECOND_LARGE_ID,
        mime_type: 'text/csv',
        byte_size: large,
        storage_pathname: 'chat-attachments/scanned',
        file_name: 'scanned.csv',
        source: 'chat-attachment',
        scan_verified: true,
      },
    ]);

    const files = await resolveLargeFileStorageFiles(db, { userId: USER, organizationId: null }, [
      LARGE_ID,
      HISTORY_ID,
      SECOND_LARGE_ID,
    ]);

    expect(files.map((file) => file.assetId)).toEqual([SECOND_LARGE_ID]);
    const lookup = statements.find((entry) => entry.sql.includes('public.media_assets'));
    expect(lookup?.sql).toContain('and scanned_sha256 = content_sha256');
  });

  it('returns nothing before the chat file schema exists', async () => {
    const unreachable = {
      query: vi.fn(async () => {
        throw new Error('no statement expected');
      }),
    };

    const files = await resolveLargeFileStorageFiles(
      createSchemaAbsentDb(unreachable),
      { userId: USER, organizationId: null },
      [LARGE_ID],
    );

    expect(files).toEqual([]);
    expect(unreachable.query).not.toHaveBeenCalled();
  });
});
