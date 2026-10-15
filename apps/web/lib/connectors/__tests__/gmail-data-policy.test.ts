// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import { readFileSync } from 'node:fs';
import type { ProviderAdapter, ChatRequest } from '@agiworkforce/types';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  endpointOverride: vi.fn(),
  agreements: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => ({ query: mocks.query }),
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/provider-adapter-service')>()),
  serverProviderHasEndpointOverride: mocks.endpointOverride,
}));
vi.mock('@/lib/services/zero-data-retention-provider-overrides', () => ({
  resolveZeroDataRetentionProviderOverrides: mocks.agreements,
}));

import {
  assertGmailModelDispatch,
  assertGmailRunAdmission,
  bindGmailConnectorExecutor,
  gmailRouteEligible,
  protectGmailProviderAdapter,
} from '../gmail-data-policy';

const model = Object.values(modelRegistry.routes).find(
  (route) => route.provider === 'vercel_gateway' && route.trustModes.includes('managed_cloud'),
)?.modelKey;
if (!model) throw new Error('No managed Vercel route exists in the canonical test catalog');
const request = (): ProcessedRequest =>
  ({
    provider: 'vercel_gateway',
    llmRequest: {
      model,
      messages: [{ role: 'tool', content: 'gmail-sentinel', tool_call_id: 'gmail-1' }],
      max_tokens: 100,
    },
    zeroDataRetentionOnly: true,
    gmailDataPolicy: { userId: 'user-1', conversationId: 'conversation-1', organizationId: null },
  }) as ProcessedRequest;
const adapter = () => {
  const stream = vi.fn(async function* (_request: ChatRequest, _signal: AbortSignal) {
    yield { type: 'text', text: 'ok' };
  });
  return { stream, value: { id: 'vercel_gateway', stream } as unknown as ProviderAdapter };
};
const dispatch = async (
  processed: ProcessedRequest,
  target: ProviderAdapter,
  zeroDataRetentionOnly = true,
) => {
  const chunks = protectGmailProviderAdapter(target, processed).stream(
    {
      model: model!,
      messages: [{ role: 'user', content: 'gmail-sentinel' }],
      zeroDataRetentionOnly,
    },
    new AbortController().signal,
  );
  for await (const _chunk of chunks) void _chunk;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([{ gmail_data_present: true }]);
  mocks.endpointOverride.mockReturnValue(false);
  mocks.agreements.mockReturnValue(new Set());
});

describe('Gmail final provider boundary', () => {
  it('admits only the positively governed managed ZDR route', async () => {
    const processed = request();
    expect(gmailRouteEligible(processed)).toBe(true);
    const target = adapter();
    await dispatch(processed, target.value);
    expect(target.stream).toHaveBeenCalledOnce();
    expect(processed.gmailDataPresent).toBe(true);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), [
      'conversation-1',
      'user-1',
      null,
    ]);
  });

  it.each(['opaque', 'free', 'unverified-direct', 'custom', 'optional-zdr', 'wire-zdr-missing'])(
    'dispatches zero Gmail content for %s',
    async (kind) => {
      const processed = request();
      if (kind === 'opaque') processed.provider = 'openrouter';
      if (kind === 'free') processed.freeTrial = {} as NonNullable<ProcessedRequest['freeTrial']>;
      if (kind === 'unverified-direct') processed.provider = 'openai';
      if (kind === 'custom') mocks.endpointOverride.mockReturnValue(true);
      if (kind === 'optional-zdr') processed.zeroDataRetentionOnly = false;
      const target = adapter();
      await expect(dispatch(processed, target.value, kind !== 'wire-zdr-missing')).rejects.toThrow(
        'mandatory zero data retention',
      );
      expect(target.stream).not.toHaveBeenCalled();
    },
  );

  it('reloads protected history after disconnect and a stale resumed checkpoint', async () => {
    const processed = request();
    processed.gmailDataPresent = false;
    processed.provider = 'openrouter';
    const target = adapter();
    await expect(dispatch(processed, target.value)).rejects.toThrow();
    expect(processed.gmailDataPresent).toBe(true);
    expect(target.stream).not.toHaveBeenCalled();
  });

  it.each(['unowned', 'missing-column', 'db-unavailable'])(
    'fails closed when final durable lookup is %s',
    async (kind) => {
      if (kind === 'unowned') mocks.query.mockResolvedValue([]);
      if (kind === 'missing-column') mocks.query.mockResolvedValue([{}]);
      if (kind === 'db-unavailable') mocks.query.mockRejectedValue(new Error('DB unavailable'));
      const target = adapter();
      await expect(dispatch(request(), target.value)).rejects.toThrow();
      expect(target.stream).not.toHaveBeenCalled();
    },
  );

  it('leaves an ordinary new conversation on its selected route', async () => {
    mocks.query.mockResolvedValue([{ gmail_data_present: false }]);
    const processed = request();
    processed.provider = 'openrouter';
    processed.zeroDataRetentionOnly = false;
    const target = adapter();
    await dispatch(processed, target.value, false);
    expect(target.stream).toHaveBeenCalledOnce();
    expect(processed.provider).toBe('openrouter');
  });
});

describe('Gmail invocation marker', () => {
  const execute = (afterMarker: () => void) =>
    vi.fn(
      async (
        _server: string,
        _name: string,
        _args: Record<string, unknown>,
        options?: { beforeGmailInvocation?: () => Promise<void> },
      ) => {
        await options?.beforeGmailInvocation?.();
        afterMarker();
        return { handled: true, content: 'gmail-result', isError: false };
      },
    );

  it('protects first Gmail use on the same selected route and carries mandatory ZDR to continuation', async () => {
    const processed = request();
    processed.gmailDataPresent = false;
    processed.zeroDataRetentionOnly = false;
    processed.llmRequest.usePromptCache = true;
    const identity = { provider: processed.provider, model: processed.llmRequest.model };
    expect(gmailRouteEligible(processed, 'discovery')).toBe(true);
    expect(gmailRouteEligible(processed)).toBe(false);
    const network = vi.fn();
    await bindGmailConnectorExecutor(execute(network), processed, 'user-1')(
      'gmail',
      'get_message',
      {},
    );
    expect(network).toHaveBeenCalledOnce();
    expect(processed).toMatchObject({
      provider: identity.provider,
      zeroDataRetentionOnly: true,
      gmailDataPresent: true,
    });
    expect(processed.llmRequest.model).toBe(identity.model);
    expect(processed.llmRequest.usePromptCache).toBe(false);
    const target = adapter();
    await dispatch(processed, target.value, processed.zeroDataRetentionOnly);
    expect(target.stream.mock.calls[0]?.[0]).toMatchObject({ zeroDataRetentionOnly: true });
  });

  it('awaits an owned marker write before invoking Gmail', async () => {
    let release: (value: unknown) => void = () => undefined;
    mocks.query.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const network = vi.fn();
    const processed = request();
    const result = bindGmailConnectorExecutor(execute(network), processed, 'user-1')(
      'gmail',
      'get_message',
      { message_id: 'mail-1' },
    );
    await Promise.resolve();
    expect(network).not.toHaveBeenCalled();
    release([{ gmail_data_present: true }]);
    await result;
    expect(network).toHaveBeenCalledOnce();
    expect(processed.gmailDataPresent).toBe(true);
    expect(mocks.query.mock.calls[0]?.[0]).toContain('returning gmail_data_present');
  });

  it.each(['missing-context', 'other-user', 'unowned', 'write-failure', 'unsafe-route'])(
    'prevents Gmail invocation on %s',
    async (kind) => {
      const processed = request();
      if (kind === 'missing-context') processed.gmailDataPolicy = undefined;
      if (kind === 'unsafe-route') processed.provider = 'openrouter';
      if (kind === 'unowned') mocks.query.mockResolvedValue([]);
      if (kind === 'write-failure') mocks.query.mockRejectedValue(new Error('write failed'));
      const network = vi.fn();
      await expect(
        bindGmailConnectorExecutor(
          execute(network),
          processed,
          kind === 'other-user' ? 'other-user' : 'user-1',
        )('gmail', 'get_message', {}),
      ).rejects.toThrow();
      expect(network).not.toHaveBeenCalled();
    },
  );

  it('rejects a client-cleared in-memory flag using the durable source', async () => {
    const processed = request();
    processed.gmailDataPresent = false;
    processed.provider = 'openrouter';
    await expect(assertGmailModelDispatch(processed)).rejects.toThrow();
  });
});

describe('Gmail run admission', () => {
  const context = {
    runId: 'run-1',
    userId: 'user-1',
    organizationId: 'org-1',
    conversationId: null,
  };
  const db = { query: mocks.query };

  it('allows a fresh ordinary run without a conversation on its owned row', async () => {
    mocks.query.mockResolvedValue([{ conversation_id: null, gmail_data_quarantined: false }]);
    await expect(assertGmailRunAdmission(db, context)).resolves.toBeNull();
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('organization_id is not distinct from $3::uuid'),
      ['run-1', 'user-1', 'org-1'],
    );
    expect(mocks.query.mock.calls[0]?.[0]).toContain('id = $1 and user_id = $2');
  });

  it('refuses legacy unattached content instead of trusting a rebuilt checkpoint', async () => {
    mocks.query.mockResolvedValue([{ conversation_id: null, gmail_data_quarantined: true }]);
    await expect(assertGmailRunAdmission(db, context)).rejects.toThrow(
      'Gmail data provenance is unknown',
    );
  });

  it('allows protected attached history only with the exact stored binding', async () => {
    mocks.query.mockResolvedValue([
      { conversation_id: 'conversation-1', gmail_data_quarantined: true },
    ]);
    await expect(
      assertGmailRunAdmission(db, { ...context, conversationId: 'conversation-1' }),
    ).resolves.toBe('conversation-1');
    await expect(
      assertGmailRunAdmission(db, { ...context, conversationId: 'other-conversation' }),
    ).rejects.toThrow('stored conversation binding');
    await expect(assertGmailRunAdmission(db, context)).rejects.toThrow(
      'stored conversation binding',
    );
  });

  it.each([
    { rows: [] },
    { rows: [{}] },
    { rows: [{ conversation_id: null, gmail_data_quarantined: 'false' }] },
    { rows: [{ conversation_id: '', gmail_data_quarantined: false }] },
  ])('refuses missing or invalid owned provenance %j', async ({ rows }) => {
    mocks.query.mockResolvedValue(rows);
    await expect(assertGmailRunAdmission(db, context)).rejects.toThrow('owned data provenance');
  });

  it('does not treat a failed database read as fresh provenance', async () => {
    mocks.query.mockRejectedValue(new Error('provenance unavailable'));
    await expect(assertGmailRunAdmission(db, context)).rejects.toThrow('provenance unavailable');
  });
});

describe('Gmail run admission migration contract', () => {
  it('quarantines legacy and old-worker rows while preserving fresh explicit inserts and immutable bindings', () => {
    const migration = readFileSync(
      new URL('../../../db/neon/0295_gmail_conversation_data_boundary.sql', import.meta.url),
      'utf8',
    );
    const down = readFileSync(
      new URL(
        '../../../db/neon/down/0295_gmail_conversation_data_boundary.down.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(migration).toMatch(
      /alter table public\.cloud_agent_runs\s+add column gmail_data_quarantined boolean not null default true/,
    );
    expect(migration).toContain('update public.cloud_agent_runs set gmail_data_quarantined = true');
    expect(migration).toContain('old.gmail_data_quarantined and not new.gmail_data_quarantined');
    expect(migration).toContain('new.conversation_id is distinct from old.conversation_id');
    expect(down).toContain('drop trigger preserve_gmail_run_quarantine on public.cloud_agent_runs');
    expect(down).toContain('drop function public.preserve_gmail_run_quarantine()');
    expect(down).toContain(
      'alter table public.cloud_agent_runs drop column gmail_data_quarantined',
    );
  });
});
