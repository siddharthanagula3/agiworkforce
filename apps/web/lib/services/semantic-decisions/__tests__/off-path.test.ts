// @vitest-environment node
//
// Every kind defaults to off, so the path measured here is the one every
// managed turn in production takes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  evaluateFlagsForSubject: vi.fn(async () => ({}) as Record<string, unknown>),
  getActiveFlagDefinitions: vi.fn(async () => [] as unknown[]),
  selectToolSchemas: vi.fn(() => ({ tools: [], deferred: [], bytes: 0 })),
  toolSchemaBytes: vi.fn(() => 0),
  buildToolShortlistRequest: vi.fn(() => ({ state: '', questions: {} })),
  buildMemoryRelevanceRequest: vi.fn(() => ({ state: '', questions: {} })),
  buildMemoryWorthExtractingRequest: vi.fn(() => ({ state: '', questions: {} })),
  buildTurnSignalsRequest: vi.fn(() => ({ state: '', questions: {} })),
  persistSemanticDecisionTraces: vi.fn((_traces: unknown) => {}),
}));

vi.mock('@/lib/feature-flags/flag-evaluation-service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/feature-flags/flag-evaluation-service')
  >('@/lib/feature-flags/flag-evaluation-service');
  return { ...actual, evaluateFlagsForSubject: () => mocks.evaluateFlagsForSubject() };
});

vi.mock('@/lib/feature-flags/flag-store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/feature-flags/flag-store')>(
    '@/lib/feature-flags/flag-store',
  );
  return { ...actual, getActiveFlagDefinitions: () => mocks.getActiveFlagDefinitions() };
});

vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-schema-loader', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/api/llm/v1/chat/completions/lib/tool-schema-loader')
  >('@/app/api/llm/v1/chat/completions/lib/tool-schema-loader');
  return {
    ...actual,
    selectToolSchemas: (input: unknown) =>
      mocks.selectToolSchemas() as ReturnType<typeof actual.selectToolSchemas> & typeof input,
    toolSchemaBytes: () => mocks.toolSchemaBytes(),
  };
});

vi.mock('../questions/connector-tool-shortlist', async () => {
  const actual = await vi.importActual<typeof import('../questions/connector-tool-shortlist')>(
    '../questions/connector-tool-shortlist',
  );
  return { ...actual, buildToolShortlistRequest: () => mocks.buildToolShortlistRequest() };
});

vi.mock('../questions/memory-relevance', async () => {
  const actual = await vi.importActual<typeof import('../questions/memory-relevance')>(
    '../questions/memory-relevance',
  );
  return { ...actual, buildMemoryRelevanceRequest: () => mocks.buildMemoryRelevanceRequest() };
});

vi.mock('../questions/memory-worth-extracting', async () => {
  const actual = await vi.importActual<typeof import('../questions/memory-worth-extracting')>(
    '../questions/memory-worth-extracting',
  );
  return {
    ...actual,
    buildMemoryWorthExtractingRequest: () => mocks.buildMemoryWorthExtractingRequest(),
  };
});

vi.mock('../questions/turn-signals', async () => {
  const actual = await vi.importActual<typeof import('../questions/turn-signals')>(
    '../questions/turn-signals',
  );
  return { ...actual, buildTurnSignalsRequest: () => mocks.buildTurnSignalsRequest() };
});

vi.mock('../trace-service', async () => {
  const actual = await vi.importActual<typeof import('../trace-service')>('../trace-service');
  return {
    ...actual,
    persistSemanticDecisionTraces: (traces: unknown) => mocks.persistSemanticDecisionTraces(traces),
  };
});

import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { toolShortlistShadowInput } from '@/app/api/llm/v1/chat/completions/lib/tool-shortlist-shadow';

import { runToolShortlistShadow } from '../consumers/tool-shortlist';
import { runMemoryRelevanceShadow } from '../consumers/memory-relevance';
import { runWorthExtractingShadow } from '../consumers/memory-worth-extracting';
import { runTurnSignalsShadow } from '../turn-signals';
import type { SemanticDecisionScope } from '../shadow';

function scope(): SemanticDecisionScope {
  return {
    request: new Request('https://app.example/api/llm/v1/chat/completions'),
    requestId: 'request-1',
    userId: 'user-1',
    plan: 'pro',
    surface: 'web',
    privacyMode: 'managed',
    workspaceId: 'workspace-1',
    zeroDataRetentionOnly: false,
    workspaceModelPolicy: null,
    residencyRegion: null,
  };
}

function connectorTool(index: number): WebMcpToolDef {
  return {
    name: `mcp__github__tool_${index}`,
    qualifiedName: `github/tool_${index}`,
    serverId: 'github',
    toolName: `tool_${index}`,
    description: 'A connector tool whose schema would have to be encoded to be counted.',
    inputSchema: { type: 'object', properties: {} },
  } as unknown as WebMcpToolDef;
}

const TOOLS = Array.from({ length: 40 }, (_, index) => connectorTool(index));

beforeEach(() => {
  vi.clearAllMocks();
  // Configured, so nothing below is excused by a missing key: the flag is the
  // only thing saying no.
  vi.stubEnv('TYPESAFE_API_KEY', 'synthetic-test-key');
  vi.stubEnv('TYPESAFE_BASE_URL', 'https://api.typesafe.ai');
  vi.stubEnv('TYPESAFE_MODEL', 'pinned-version');
  vi.stubEnv('TYPESAFE_INPUT_MICROUSD_PER_MTOK', '42000');
  mocks.evaluateFlagsForSubject.mockResolvedValue({});
  mocks.getActiveFlagDefinitions.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('a disabled decision costs nothing measurable', () => {
  it('CRITICAL: never ranks the catalog a second time or counts a schema byte', async () => {
    const turnText = vi.fn(() => 'open the pull request I was looking at');
    const network = vi.fn();
    vi.stubGlobal('fetch', network);

    await runToolShortlistShadow(
      toolShortlistShadowInput({ scope: scope(), tools: TOOLS, turnText }),
    );

    expect(turnText).not.toHaveBeenCalled();
    expect(mocks.selectToolSchemas).not.toHaveBeenCalled();
    expect(mocks.toolSchemaBytes).not.toHaveBeenCalled();
    expect(mocks.buildToolShortlistRequest).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(mocks.persistSemanticDecisionTraces).not.toHaveBeenCalled();
  });

  it.each([
    [
      'memory relevance',
      (derive: () => never) => runMemoryRelevanceShadow({ scope: scope(), derive }),
      mocks.buildMemoryRelevanceRequest,
    ],
    [
      'worth extracting',
      (derive: () => never) => runWorthExtractingShadow({ scope: scope(), derive }),
      mocks.buildMemoryWorthExtractingRequest,
    ],
    [
      'turn signals',
      (derive: () => never) => runTurnSignalsShadow({ scope: scope(), derive }),
      mocks.buildTurnSignalsRequest,
    ],
  ])('builds no %s request and derives nothing', async (_label, run, builder) => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const derive = vi.fn((): never => {
      throw new Error('the response path derived work for a kind that is off');
    });

    await run(derive);

    expect(derive).not.toHaveBeenCalled();
    expect(builder).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('CRITICAL: reads the decision flags once for the turn, not once per kind', async () => {
    const shared = scope();
    const derive = vi.fn((): never => {
      throw new Error('the response path derived work for a kind that is off');
    });

    await Promise.all([
      runToolShortlistShadow(
        toolShortlistShadowInput({ scope: shared, tools: TOOLS, turnText: () => '' }),
      ),
      runMemoryRelevanceShadow({ scope: shared, derive }),
      runWorthExtractingShadow({ scope: shared, derive }),
      runTurnSignalsShadow({ scope: shared, derive }),
    ]);

    expect(mocks.evaluateFlagsForSubject).toHaveBeenCalledTimes(1);
    expect(mocks.getActiveFlagDefinitions).toHaveBeenCalledTimes(1);
  });

  it('gives a second turn its own answer rather than the first turn’s', async () => {
    const derive = vi.fn((): never => {
      throw new Error('the response path derived work for a kind that is off');
    });

    await runTurnSignalsShadow({ scope: scope(), derive });
    await runTurnSignalsShadow({ scope: scope(), derive });

    expect(mocks.evaluateFlagsForSubject).toHaveBeenCalledTimes(2);
  });
});
