import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';

type SafetyModule = typeof import('@/lib/services/managed-content-safety-service');
type MemoryModule = typeof import('@/lib/services/managed-memory-context-service');
type IdentityModule = typeof import('@/lib/server/user-identity');
type UsageModule = typeof import('@/lib/services/managed-usage-request-service');
type DerivedKeysModule = typeof import('@/lib/server/chat-file-preparation/derived-keys');
type SchemaModule = typeof import('@/lib/server/chat-file-intake/schema');

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

type RlsDbModule = typeof import('@/lib/server/rls-db');
type MediaAssetsModule = typeof import('@/lib/server/media-assets');
type MediaStorageModule = typeof import('@/lib/server/media-storage');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  getMediaAssetById: vi.fn(),
  readStoredMedia: vi.fn(),
  storage: { current: null as unknown },
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user_preparation',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<SafetyModule>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});
vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<MemoryModule>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});
vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<IdentityModule>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<UsageModule>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<MediaAssetsModule>()),
  getMediaAssetById: mocks.getMediaAssetById,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<MediaStorageModule>()),
  readStoredMedia: mocks.readStoredMedia,
  deleteStoredMedia: vi.fn(),
}));
vi.mock('@/lib/server/chat-file-preparation/derived-keys', async (importOriginal) => {
  const actual = await importOriginal<DerivedKeysModule>();
  return { ...actual, defaultPreparationStorage: () => mocks.storage.current };
});
vi.mock('@/lib/server/chat-file-intake/schema', async (importOriginal) => {
  const actual = await importOriginal<SchemaModule>();
  return {
    ...actual,
    chatFileSchemaReady: (db: Parameters<SchemaModule['chatFileSchemaReady']>[0]) =>
      actual.chatFileSchemaReady(db),
  };
});

import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { CreditService } from '@/lib/services/credit-service';
import {
  BUCKET,
  FakePreparationDb,
  USER,
  createCountingStorage,
  type CountingStorage,
} from '@/lib/server/chat-file-preparation/__tests__/preparation-harness';
import {
  preparationKeyPrefix,
  textSegmentKey,
} from '@/lib/server/chat-file-preparation/derived-keys';
import { OPEN_FILE_TOOL_NAME, SEARCH_FILES_TOOL_NAME } from '@/lib/server/tools/file-search-tool';
import type { AuthGateSuccess } from './auth-gate';
import { LARGE_FILE_CARD_KEY, LARGE_FILE_TEXT_KEY } from './attachment-turn-budget';
import {
  buildApprovalCheckpointRequest,
  checkpointRequestForResume,
  restoreCheckpointedTurn,
} from './approval-checkpoint-request';
import { processRequest } from './request-processor';

const LARGE_ID = '11111111-1111-4111-8111-111111111111';
const SMALL_ID = '33333333-3333-4333-8333-333333333333';

const proSubscription = {
  id: 'sub-pro',
  user_id: USER,
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-11-01T00:00:00Z'),
  current_period_end: new Date('2026-12-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

let prep: FakePreparationDb;
let storage: CountingStorage;
let assets: Map<string, { byteSize: number; mimeType: string; filename: string; stored?: Buffer }>;

function request(key: string, assetId: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `large-file-${key}`,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Which region has the largest total?' },
            { type: 'file', file: { asset_id: assetId } },
          ],
        },
      ],
    }),
  });
}

function requestWith(
  key: string,
  assetIds: string[],
  options: { headers?: Record<string, string>; body?: Record<string, unknown> } = {},
): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `large-file-${key}`,
      'x-agi-surface': 'web',
      ...options.headers,
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      stream: true,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Which region has the largest total?' },
            ...assetIds.map((assetId) => ({ type: 'file', file: { asset_id: assetId } })),
          ],
        },
      ],
      ...options.body,
    }),
  });
}

const SMALL_PDF_ID = '55555555-5555-4555-8555-555555555555';
const SMALL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

function pdfParts(
  messages: readonly { content: unknown; multimodal_content?: unknown[] }[],
): unknown[] {
  return messages.flatMap((message) =>
    [
      ...(message.multimodal_content ?? []),
      ...(Array.isArray(message.content) ? message.content : []),
    ].filter((part) => JSON.stringify(part).includes('application/pdf')),
  );
}

function auth(): AuthGateSuccess {
  return {
    ok: true,
    userId: USER,
    token: 'session-token',
    subscription: proSubscription,
    boundSurface: 'web',
  };
}

async function seedPreparation(assetId: string, text: string, state = 'ready'): Promise<void> {
  const segmentKey = textSegmentKey(preparationKeyPrefix(USER, assetId, 1), 1);
  await storage.memory.put({
    bucket: BUCKET,
    key: segmentKey,
    body: Buffer.from(text),
    contentType: 'text/plain',
  });
  prep.rows.set(`row-${assetId}`, {
    id: `row-${assetId}`,
    media_asset_id: assetId,
    user_id: USER,
    organization_id: null,
    kind: 'text',
    state,
    preparer_version: 1,
    cursor: {},
    segments_ready: 1,
    pages_read: 0,
    page_count: null,
    sheet_count: null,
    indexed_chars: '0',
    derived_keys: [segmentKey],
    coverage: { segmentChars: [text.length], textChars: text.length },
    error: null,
    updated_at: new Date(),
  });
}

function toolNames(tools: readonly unknown[] | undefined): Array<string | undefined> {
  return (tools ?? []).map((tool) => (tool as { function?: { name?: string } }).function?.name);
}

function markedParts(
  messages: readonly { multimodal_content?: unknown[] }[],
  key: string,
): unknown[] {
  return messages.flatMap((message) =>
    (message.multimodal_content ?? []).filter(
      (part) => !!part && typeof part === 'object' && key in (part as Record<string, unknown>),
    ),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of [
    mocks.enforceSafety,
    mocks.loadPolicy,
    mocks.customInstructions,
    mocks.scopedQuery,
    mocks.reserveManagedUsage,
    mocks.getMediaAssetById,
    mocks.readStoredMedia,
  ]) {
    mock.mockReset();
  }
  prep = new FakePreparationDb();
  storage = createCountingStorage();
  mocks.storage.current = storage;
  assets = new Map();
  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/chat_file_|to_regclass/.test(sql)) return prep.query(sql, params);
    return [];
  });
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: USER,
      idempotencyKey: 'large-file',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );
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
      storagePathname: `chat-attachments/${USER}/${id}`,
      metadata: { filename: fixture.filename },
      deletedAt: null,
    };
  });
  mocks.readStoredMedia.mockImplementation(async (pathname: string) => {
    const fixture = assets.get(pathname.split('/').pop() ?? '');
    return fixture?.stored ? { data: fixture.stored, contentType: fixture.mimeType } : null;
  });
  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 100_000,
    credits_remaining_cents: 90_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

describe('processRequest with a large attached file', () => {
  it('gives the turn a ledger, the large-file card and text, and the file tools', async () => {
    assets.set(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'sales.csv',
    });
    await seedPreparation(LARGE_ID, 'region,total\nEMEA,12\nAPAC,30\n');

    const result = await processRequest(request('large-1', LARGE_ID), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.largeFileTurn).toMatchObject({
      assetIds: [LARGE_ID],
      attachmentAssetIds: [LARGE_ID],
      readingClosed: false,
      fileToolsOffered: true,
    });
    expect(result.largeFileTurn!.limitTokens).toBeGreaterThan(0);
    expect(result.largeFileTurn!.charged).toBeGreaterThan(0);
    expect(result.largeFileTurn!.charged).toBeLessThanOrEqual(result.largeFileTurn!.limitTokens);
    expect(result.largeFileTurn!.pendingStepAllowance).toBeGreaterThanOrEqual(0);
    expect(toolNames(result.llmRequest.tools)).toEqual(
      expect.arrayContaining([OPEN_FILE_TOOL_NAME, SEARCH_FILES_TOOL_NAME]),
    );
    expect(markedParts(result.llmRequest.messages, LARGE_FILE_CARD_KEY)).toHaveLength(1);
    expect(markedParts(result.llmRequest.messages, LARGE_FILE_TEXT_KEY)).toHaveLength(1);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
    expect(storage.stats.reads).toBe(0);
  });

  it('reports a current-turn file read only in part through the truncation list', async () => {
    assets.set(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'sales.csv',
    });
    await seedPreparation(LARGE_ID, 'region,total\nEMEA,12\n', 'preparing');

    const result = await processRequest(request('large-2', LARGE_ID), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.truncatedAttachments).toContain('sales.csv');
  });

  it('on the api surface a large file adds no server file tools and the card does not offer them', async () => {
    assets.set(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'sales.csv',
    });
    await seedPreparation(LARGE_ID, 'region,total\nEMEA,12\nAPAC,30\n');
    const { boundSurface: _web, ...apiAuth } = auth();

    const result = await processRequest(
      requestWith('large-api', [LARGE_ID], { headers: { 'x-agi-surface': 'api' } }),
      { ...apiAuth, token: 'sk_test_large_file_fixture' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('api');
    expect(toolNames(result.llmRequest.tools)).not.toContain(OPEN_FILE_TOOL_NAME);
    expect(toolNames(result.llmRequest.tools)).not.toContain(SEARCH_FILES_TOOL_NAME);
    expect(result.largeFileTurn?.fileToolsOffered).toBe(false);
  });

  it('a research turn with a large file does not tell the model to use the file tools', async () => {
    assets.set(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'sales.csv',
    });
    await seedPreparation(LARGE_ID, 'region,total\nEMEA,12\nAPAC,30\n');

    const result = await processRequest(
      requestWith('large-research', [LARGE_ID], { body: { research: true } }),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.researchMode).toBe(true);
    expect(result.largeFileTurn?.fileToolsOffered).toBe(false);
    const card = markedParts(result.llmRequest.messages, LARGE_FILE_CARD_KEY)[0] as {
      text: string;
    };
    expect(card.text).not.toContain(OPEN_FILE_TOOL_NAME);
  });

  it('a small PDF beside a large file is sent exactly as it is without the large file', async () => {
    assets.set(SMALL_PDF_ID, {
      byteSize: SMALL_PDF.byteLength,
      mimeType: 'application/pdf',
      filename: 'brief.pdf',
      stored: SMALL_PDF,
    });
    assets.set(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'sales.csv',
    });
    await seedPreparation(LARGE_ID, 'region,total\nEMEA,12\nAPAC,30\n');

    const alone = await processRequest(requestWith('pdf-alone', [SMALL_PDF_ID]), auth());
    const beside = await processRequest(
      requestWith('pdf-beside', [SMALL_PDF_ID, LARGE_ID]),
      auth(),
    );

    expect(alone.ok && beside.ok).toBe(true);
    if (!alone.ok || !beside.ok) return;
    const alonePdf = pdfParts(alone.llmRequest.messages);
    expect(alonePdf).toHaveLength(1);
    expect(pdfParts(beside.llmRequest.messages)).toEqual(alonePdf);
    expect(beside.largeFileTurn).toBeDefined();
  });

  it('a turn resumed from its checkpoint offers the file tools the paused turn offered', async () => {
    assets.set(LARGE_ID, {
      byteSize: MAX_CHAT_ATTACHMENT_BYTES + 1,
      mimeType: 'text/csv',
      filename: 'sales.csv',
    });
    await seedPreparation(LARGE_ID, 'region,total\nEMEA,12\nAPAC,30\n');
    const paused = await processRequest(request('large-paused', LARGE_ID), auth());
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    const checkpoint = JSON.parse(
      JSON.stringify({
        request: buildApprovalCheckpointRequest(
          paused.chatRequest,
          {},
          [],
          undefined,
          undefined,
          undefined,
          undefined,
          paused.largeFileTurn,
        ),
        messages: paused.llmRequest.messages.map(({ role, content }) => ({ role, content })),
      }),
    );
    const replay = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'large-file-resumed',
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        ...checkpointRequestForResume(checkpoint.request, false),
        messages: checkpoint.messages,
        stream: true,
      }),
    });

    const resumed = await processRequest(replay, auth());

    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.largeFileTurn).toBeUndefined();
    expect(toolNames(resumed.llmRequest.tools)).not.toContain(OPEN_FILE_TOOL_NAME);
    restoreCheckpointedTurn(resumed, checkpoint);
    expect(resumed.largeFileTurn?.fileToolsOffered).toBe(true);
    const names = toolNames(resumed.llmRequest.tools);
    expect(names).toEqual(expect.arrayContaining([OPEN_FILE_TOOL_NAME, SEARCH_FILES_TOOL_NAME]));
    expect(names.filter((name) => name === OPEN_FILE_TOOL_NAME)).toHaveLength(1);
  });

  it('a turn with only a small file has no ledger and no large-file content', async () => {
    assets.set(SMALL_ID, {
      byteSize: 5,
      mimeType: 'text/plain',
      filename: 'notes.txt',
      stored: Buffer.from('hello'),
    });

    const result = await processRequest(request('small-1', SMALL_ID), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).not.toHaveProperty('largeFileTurn');
    expect(markedParts(result.llmRequest.messages, LARGE_FILE_CARD_KEY)).toEqual([]);
    expect(markedParts(result.llmRequest.messages, LARGE_FILE_TEXT_KEY)).toEqual([]);
    expect(prep.statements).toEqual([]);
  });
});
