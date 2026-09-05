import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash, randomUUID } from 'crypto';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idempotency-key'),
    deductCredits: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: { calculateCost: vi.fn(() => 4) },
  isCacheTokensDisjointFromInput: vi.fn(),
  normalizeProviderId: vi.fn(),
  resolveCacheRates: vi.fn(),
}));
vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

const objectStore = new Map<string, { data: Buffer; contentType: string }>();
interface AssetRow {
  id: string;
  userId: string;
  organizationId: string | null;
  kind: string;
  mimeType: string;
  byteSize: number;
  storageUrl: string;
  storagePathname: string;
  metadata: Record<string, unknown>;
  deletedAt: null;
}
const assetRows = new Map<string, AssetRow>();

vi.mock('@/lib/server/media-storage', async () => {
  const { randomUUID: uuid } = await import('crypto');
  return {
    isMediaStorageConfigured: () => true,
    isGeneratedMediaStorageConfigured: () => true,
    readStoredMedia: async (key: string) => {
      const entry = objectStore.get(key);
      return entry ? { data: entry.data, contentType: entry.contentType } : null;
    },
    storeMedia: async (p: { userId: string; kind: string; data: Buffer; contentType: string }) => {
      const pathname = `private-media/${p.kind}/${p.userId}/${uuid()}`;
      objectStore.set(pathname, { data: Buffer.from(p.data), contentType: p.contentType });
      return {
        url: pathname,
        pathname,
        byteSize: p.data.byteLength,
        contentType: p.contentType,
      };
    },
    deleteStoredMedia: async (pathname: string) => {
      objectStore.delete(pathname);
    },
    streamStoredMedia: async (pathname: string, range?: { start: number; end: number }) => {
      const entry = objectStore.get(pathname);
      if (!entry) return null;
      const start = range?.start ?? 0;
      const end = range?.end ?? entry.data.byteLength - 1;
      const slice = entry.data.subarray(start, end + 1);
      return {
        body: new Blob([Uint8Array.from(slice)]).stream() as ReadableStream<Uint8Array>,
        contentType: entry.contentType,
        contentLength: slice.byteLength,
        contentRange: range ? `bytes ${start}-${end}/${entry.data.byteLength}` : undefined,
      };
    },
  };
});

vi.mock('@/lib/server/media-assets', async () => {
  const { randomUUID: uuid } = await import('crypto');
  return {
    insertMediaAsset: async (p: {
      userId: string;
      organizationId: string | null;
      kind: string;
      mimeType: string;
      byteSize?: number;
      storageUrl: string;
      storagePathname?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const id = uuid();
      assetRows.set(id, {
        id,
        userId: p.userId,
        organizationId: p.organizationId,
        kind: p.kind,
        mimeType: p.mimeType,
        byteSize: p.byteSize ?? 0,
        storageUrl: p.storageUrl,
        storagePathname: p.storagePathname ?? '',
        metadata: p.metadata ?? {},
        deletedAt: null,
      });
      return id;
    },
    getActiveWorkspaceMediaAssetById: async (userId: string, id: string) => {
      const row = assetRows.get(id);
      return row?.userId === userId && row.organizationId === null ? row : null;
    },
    getMediaAssetById: async (id: string) => assetRows.get(id) ?? null,
  };
});

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {},
    userId: 'user-gen',
    organizationId: null,
  })),
}));

import { buildAdapterStreamResponse } from '../../../llm/v1/chat/completions/lib/stream-transform';
import { GET as serveFile } from '../route';
import type { ProcessedRequest } from '../../../llm/v1/chat/completions/lib/request-processor';
import type { StreamChunk } from '@agiworkforce/types';

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-genfile-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true },
    requestedModel: 'fixture-model',
    provider: 'anthropic',
    estimatedCostCents: 5,
    quotaWarningHeader: null,
    quotaFeature: 'standard',
    isFlagshipRequest: false,
    usedFallback: false,
    resolvedTaskType: null,
    classifierConfidence: null,
    resolvedSlot: null,
    indicResult: { isIndic: false, dominantScript: null, indicRatio: 0 },
    originalModel: undefined,
    fallbackReason: undefined,
    freeTrial: undefined,
  } as unknown as ProcessedRequest;
}

async function* chunksOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

async function readAllText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function parseGeneratedFilesEvent(sse: string): Array<{
  id: string;
  file_name: string;
  mime_type: string;
  uri: string;
  checksum_sha256: string;
}> {
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
    try {
      const parsed = JSON.parse(line.slice(6));
      const files = parsed?.choices?.[0]?.delta?.x_generated_files?.files;
      if (files) return files;
    } catch {
      /* not json */
    }
  }
  return [];
}

const RECORDED_PDF = Buffer.from('%PDF-1.7\nreplayed provider pdf bytes\n%%EOF', 'utf8');
const RECORDED_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-payload-from-openai-container'),
]);

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  objectStore.clear();
  assetRows.clear();
  vi.stubGlobal('fetch', fetchSpy);
  process.env['OPENAI_API_KEY'] = 'sk-test';
  process.env['ANTHROPIC_API_KEY'] = 'ak-test';
});

describe('generated-file byte pipeline (adapter stream → persist → serve)', () => {
  it('persists an Anthropic code-execution output and serves hash-identical bytes same-origin', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url === 'https://api.anthropic.com/v1/files/file_abc') {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ id: 'file_abc', filename: 'analysis.pdf' }),
        };
      }
      if (url === 'https://api.anthropic.com/v1/files/file_abc/content') {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/pdf' : null),
          },
          arrayBuffer: async () => RECORDED_PDF,
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Here is your report.' },
      {
        type: 'server-tool-result',
        toolUseId: 'srvtoolu_1',
        payload: {
          type: 'code_execution_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: {
            type: 'code_execution_result',
            stdout: 'wrote analysis.pdf\n',
            stderr: '',
            return_code: 0,
            content: [{ type: 'code_execution_output', file_id: 'file_abc' }],
          },
        },
      } as unknown as StreamChunk,
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      new Request('https://example.com/api/llm/v1/chat/completions', { method: 'POST' }) as never,
      chunksOf(chunks),
      makeProcessed(),
      'user-gen',
      'token',
      Date.now(),
    );
    const sse = await readAllText(response as unknown as Response);

    const files = parseGeneratedFilesEvent(sse);
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.file_name).toBe('analysis.pdf');
    expect(file.mime_type).toBe('application/pdf');
    expect(file.uri).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);
    expect(sse.indexOf('x_generated_files')).toBeLessThan(sse.indexOf('data: [DONE]'));

    const id = file.uri.slice('/api/files/'.length);
    const served = await serveFile(
      new Request(`https://example.com/api/files/${id}`) as never,
      { params: Promise.resolve({ id }) } as never,
    );
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('application/pdf');
    const servedBytes = Buffer.from(await served.arrayBuffer());

    const hashIn = createHash('sha256').update(RECORDED_PDF).digest('hex');
    const hashOut = createHash('sha256').update(servedBytes).digest('hex');
    expect(hashOut).toBe(hashIn);
    expect(file.checksum_sha256).toBe(hashIn);
  });

  it('persists an OpenAI container-file citation found anywhere in the stream payloads', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url === 'https://api.openai.com/v1/containers/cntr_9/files/cfile_7/content') {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/png' : null),
          },
          arrayBuffer: async () => RECORDED_PNG,
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Chart attached.' },
      {
        type: 'vendor-raw',
        payload: {
          annotations: [
            {
              type: 'container_file_citation',
              file_id: 'cfile_7',
              container_id: 'cntr_9',
              filename: 'chart.png',
            },
          ],
        },
      } as unknown as StreamChunk,
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      new Request('https://example.com/api/llm/v1/chat/completions', { method: 'POST' }) as never,
      chunksOf(chunks),
      makeProcessed(),
      'user-gen',
      'token',
      Date.now(),
    );
    const sse = await readAllText(response as unknown as Response);

    const files = parseGeneratedFilesEvent(sse);
    expect(files).toHaveLength(1);
    expect(files[0]!.file_name).toBe('chart.png');
    expect(files[0]!.mime_type).toBe('image/png');
    expect(files[0]!.checksum_sha256).toBe(createHash('sha256').update(RECORDED_PNG).digest('hex'));

    const { getUserScopedDb } = await import('@/lib/server/rls-db');
    (getUserScopedDb as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      db: {},
      userId: 'user-other',
      organizationId: null,
    });
    const id = files[0]!.uri.slice('/api/files/'.length);
    const served = await serveFile(
      new Request(`https://example.com/api/files/${id}`) as never,
      { params: Promise.resolve({ id }) } as never,
    );
    expect(served.status).toBe(404);
  });

  it('surfaces an honest inline note (not silence) when the provider fetch fails', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });

    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Done.' },
      {
        type: 'server-tool-result',
        toolUseId: 'srvtoolu_2',
        payload: {
          type: 'code_execution_tool_result',
          tool_use_id: 'srvtoolu_2',
          content: {
            type: 'code_execution_result',
            stdout: '',
            stderr: '',
            return_code: 0,
            content: [{ type: 'code_execution_output', file_id: 'file_gone' }],
          },
        },
      } as unknown as StreamChunk,
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      new Request('https://example.com/api/llm/v1/chat/completions', { method: 'POST' }) as never,
      chunksOf(chunks),
      makeProcessed(),
      'user-gen',
      'token',
      Date.now(),
    );
    const sse = await readAllText(response as unknown as Response);

    expect(sse).not.toContain('x_generated_files');
    expect(sse).toContain('could not be retrieved');
    expect(sse.indexOf('could not be retrieved')).toBeLessThan(sse.indexOf('data: [DONE]'));
  });
});

void randomUUID;
