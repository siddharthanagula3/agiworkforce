import { beforeEach, describe, expect, it, vi } from 'vitest';
type RoutingModule = typeof import('@agiworkforce/routing');
type RegistryModule = typeof import('@/lib/prompts/prompt-registry');

type ScanModule0 = typeof import('@/lib/services/provider-adapter-service');
type ScanModule1 = typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-response');
type ScanModule2 = typeof import('@/lib/services/cogs-ledger-service');

const served = vi.hoisted(() => ({ variant: undefined as number | undefined }));

vi.mock('@/lib/prompts/prompt-registry', async (importOriginal) => {
  const actual = await importOriginal<RegistryModule>();
  return {
    ...actual,
    resolvePrompt: (id: Parameters<RegistryModule['resolvePrompt']>[0]) =>
      actual.resolvePrompt(
        id,
        served.variant === undefined ? {} : { variants: { [id]: served.variant } },
      ),
  };
});
vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<RoutingModule>();
  const { modelMocks } = await import('./fixtures/model-mocks');
  return { ...actual, resolveAutoRoute: modelMocks.resolveAutoRoute };
});
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    ...(await importOriginal<ScanModule0>()),
    buildServerProviderAdapter: modelMocks.buildServerProviderAdapter,
    toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  };
});
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    ...(await importOriginal<ScanModule1>()),
    drainToLlmResponse: modelMocks.drainToLlmResponse,
  };
});

const recordSettledProviderCost = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  recordSettledProviderCost: (...args: unknown[]) => recordSettledProviderCost(...args),
}));

import { PROMPT_MANIFEST } from '@/lib/prompts/prompt-manifest';
import { promptStamp } from '@/lib/prompts/prompt-registry';
import { admitEveryModelCall, armModelMocks, modelMocks } from './fixtures/model-mocks';
import { callSupportModel, SUPPORT_SYSTEM_PROMPT_ID } from '../answer/model-route';

const ENTRY = PROMPT_MANIFEST[SUPPORT_SYSTEM_PROMPT_ID];

function sentSystemPrompt(): unknown {
  return (modelMocks.streamedRequests.at(-1) as { system?: unknown } | undefined)?.system;
}

function stampedPromptIds(): unknown {
  const [row] = recordSettledProviderCost.mock.calls.at(-1) ?? [];
  return (row as { promptIds?: unknown } | undefined)?.promptIds;
}

async function ask(): Promise<void> {
  await callSupportModel({
    userMessage: 'how do I add my provider key',
    userId: null,
    surface: 'marketing',
    admitModelCall: admitEveryModelCall,
  });
}

describe('the support prompt sent is the one that is stamped', () => {
  beforeEach(() => {
    armModelMocks();
    recordSettledProviderCost.mockClear();
    served.variant = undefined;
  });

  it('holds more than one version, so the stamp and the text could disagree', () => {
    const texts = new Set(ENTRY.versions.map((version) => version.text));
    expect(ENTRY.versions.length).toBeGreaterThan(1);
    expect(texts.size).toBe(ENTRY.versions.length);
  });

  it('sends the pinned version and stamps the same one by default', async () => {
    const pinned = ENTRY.versions.find((version) => version.version === ENTRY.pinnedVersion);

    await ask();

    expect(sentSystemPrompt()).toBe(pinned?.text);
    expect(stampedPromptIds()).toEqual([
      promptStamp(SUPPORT_SYSTEM_PROMPT_ID, ENTRY.pinnedVersion),
    ]);
  });

  it.each(ENTRY.versions.map((version) => [version.version, version.text] as const))(
    'sends the text of version %i when the registry resolves that version',
    async (version, text) => {
      served.variant = version;

      await ask();

      expect(sentSystemPrompt()).toBe(text);
      expect(stampedPromptIds()).toEqual([promptStamp(SUPPORT_SYSTEM_PROMPT_ID, version)]);
    },
  );
});
