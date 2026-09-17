import { describe, expect, it } from 'vitest';
import { modelsCatalog } from '@agiworkforce/types';
import type {
  DeveloperRuntimeModels,
  DeveloperSessionGroup,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';

/** A real catalog entry, read at run time so no concrete id is pinned here. */
const catalogModelId = Object.keys(modelsCatalog.models)[0] as string;
const catalogModelName = modelsCatalog.models[catalogModelId]?.name as string;
const OTHER_MODEL = 'qa-provider/qa-other';
const LOCAL_MODEL = 'qa-runner/qa-local';
const CONFIGURED_MODEL = 'qa-provider/qa-default';
import {
  EMPTY_LOCAL_TURN,
  detectTestCommand,
  localModelChoices,
  localFailureAction,
  localFolderChoice,
  localFolderChoices,
  localModelLabel,
  localModelSetup,
  localProviderSetups,
  localTurnFailureSentence,
  startingModelId,
  localSessionContext,
  localSessionOriginLabel,
  localTranscriptItems,
  localTurnIsRunning,
  localTurnStopReason,
  newSessionLabel,
  preferredLocalRootId,
  sharedUnavailableLine,
} from './local-code';

const session: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: 'root-1',
  title: 'Quote the readme',
  cwd: '/work/qa-project',
  model: OTHER_MODEL,
  provider: 'a-provider',
  trustMode: 'byok',
  status: 'idle',
  createdAt: '2026-09-14T11:00:00Z',
  updatedAt: '2026-09-14T11:05:00Z',
  origin: 'vscode',
};

function group(overrides: Partial<DeveloperSessionGroup> = {}): DeveloperSessionGroup {
  return {
    rootId: 'root-1',
    name: 'qa-project',
    path: '/work/qa-project',
    branch: 'main',
    sessions: [session],
    ...overrides,
  };
}

const runtime: DeveloperRuntimeModels = {
  models: [
    { id: LOCAL_MODEL, provider: 'qa-runner', local: true },
    { id: OTHER_MODEL, provider: 'qa-provider', local: true },
  ],
  hostModels: [],
  defaultModelId: CONFIGURED_MODEL,
  managedSignedIn: false,
};

const hostRuntime: DeveloperRuntimeModels = {
  ...runtime,
  hostModels: [
    {
      id: LOCAL_MODEL,
      provider: 'qa-runner',
      reachable: true,
      trustMode: 'local',
      unreachable: null,
    },
    {
      id: OTHER_MODEL,
      provider: 'qa-provider',
      reachable: false,
      trustMode: 'byok',
      unreachable: {
        code: 'provider_auth_missing',
        action: 'sign_in_provider',
        provider: 'qa-provider',
      },
    },
  ],
};

describe('local code surface', () => {
  it('offers only what the host can reach, whatever the folder has used', () => {
    const choices = localModelChoices(hostRuntime, [{ ...session, model: catalogModelId }]);

    expect(choices.map((choice) => [choice.id, choice.evidence])).toEqual([
      [LOCAL_MODEL, 'reachable'],
      [CONFIGURED_MODEL, 'configured'],
    ]);
  });

  it('names a route once, however many of its models cannot run', () => {
    const setups = localProviderSetups(hostRuntime);

    expect(setups).toHaveLength(1);
    expect(setups[0]?.provider).toBe('qa-provider');
    expect(setups[0]?.count).toBe(1);
    expect(setups[0]?.offer).toEqual({ kind: 'copy', text: 'agi login qa-provider' });
  });

  it('says which route a model is waiting on, and nothing for one that runs', () => {
    expect(localModelSetup(hostRuntime, OTHER_MODEL)?.provider).toBe('qa-provider');
    expect(localModelSetup(hostRuntime, LOCAL_MODEL)).toBeNull();
    expect(localModelSetup(null, OTHER_MODEL)).toBeNull();
  });

  it('starts a session on a model the host can reach, never one it cannot', () => {
    expect(startingModelId(hostRuntime, [{ ...session, model: OTHER_MODEL }])).toBe(LOCAL_MODEL);
  });

  it('offers what the folder has used, then what is installed, then the default', () => {
    const choices = localModelChoices(runtime, [
      { ...session, model: catalogModelId },
      { ...session, id: 'b', model: catalogModelId },
    ]);

    expect(choices.map((choice) => [choice.id, choice.evidence])).toEqual([
      [catalogModelId, 'used-here'],
      [LOCAL_MODEL, 'installed'],
      [OTHER_MODEL, 'installed'],
      [CONFIGURED_MODEL, 'configured'],
    ]);
    expect(choices[0]?.label).toBe(catalogModelName);
  });

  it('starts a session on the best-evidenced model rather than the configured default', () => {
    expect(startingModelId(runtime, [{ ...session, model: catalogModelId }])).toBe(catalogModelId);
    expect(startingModelId(runtime, [])).toBe(LOCAL_MODEL);
    expect(startingModelId({ ...runtime, models: [] }, [])).toBe(CONFIGURED_MODEL);
    expect(startingModelId(null, [])).toBeUndefined();
  });

  it('names a model once, however many sessions used it', () => {
    const choices = localModelChoices(
      {
        models: [{ id: OTHER_MODEL, provider: 'qa-provider', local: false }],
        hostModels: [],
        defaultModelId: OTHER_MODEL,
        managedSignedIn: true,
      },
      [{ ...session, model: OTHER_MODEL }],
    );

    expect(choices).toHaveLength(1);
    expect(choices[0]?.evidence).toBe('used-here');
  });

  it('names the surface that opened a session', () => {
    expect(localSessionOriginLabel(session)).toBe('VS Code');
    expect(localSessionOriginLabel({ ...session, origin: 'cli' })).toBe('CLI');
    expect(localSessionOriginLabel({ ...session, origin: 'desktop' })).toBe('Desktop');
  });

  it('names a model the way the catalog does', () => {
    expect(localModelLabel(catalogModelId)).toBe(catalogModelName);
    expect(localModelLabel(null)).toBeNull();
  });

  it('keeps the id of a model the catalog does not carry', () => {
    expect(localModelLabel(LOCAL_MODEL)).toBe(LOCAL_MODEL);
  });

  it('reads the folder, branch, model and trust into one line', () => {
    expect(localSessionContext({ ...session, model: catalogModelId }, group())).toBe(
      `qa-project · main · ${catalogModelName} · Your key`,
    );
  });

  it('drops a branch a folder does not have rather than printing its absence', () => {
    expect(
      localSessionContext({ ...session, model: catalogModelId }, group({ branch: null })),
    ).toBe(`qa-project · ${catalogModelName} · Your key`);
  });

  it('says a missing key in the desktop\u2019s own words, naming the terminal command', () => {
    expect(
      localTurnFailureSentence({
        code: 'provider_auth_missing',
        message: '[anthropic] Authentication failed: No API key found. Run `agi login anthropic`.',
        provider: 'anthropic',
        action: 'sign_in_provider',
        retryable: false,
      }),
    ).toBe(
      'No Anthropic key on this computer. Run `agi login anthropic` in a terminal, then start a new session.',
    );
  });

  it('keeps the CLI line for a failure it has nothing better to say about', () => {
    expect(
      localTurnFailureSentence({
        code: 'unknown',
        message: 'The model refused the request.',
        provider: 'deepseek',
        action: 'none',
        retryable: false,
      }),
    ).toBe('The model refused the request.');
  });

  it('offers the command to copy rather than a sign-in button it cannot honour', () => {
    expect(
      localFailureAction({
        code: 'provider_auth_missing',
        message: 'x',
        provider: 'anthropic',
        action: 'sign_in_provider',
        retryable: false,
      }),
    ).toEqual({ kind: 'copy', text: 'agi login anthropic' });
  });

  it('offers a resend only when the CLI says the turn is retryable', () => {
    const base = { code: 'provider_rate_limited', message: 'x', provider: 'qa-provider' } as const;

    expect(localFailureAction({ ...base, action: 'retry', retryable: true })).toEqual({
      kind: 'retry',
    });
    expect(localFailureAction({ ...base, action: 'retry', retryable: false })).toBeNull();
    expect(localFailureAction({ ...base, action: 'none', retryable: true })).toBeNull();
  });

  it('names the folder in the new-session action', () => {
    expect(newSessionLabel('qa-project')).toBe('New session in qa-project');
  });

  it('shows a stored transcript with no stop reason on any reply', () => {
    const items = localTranscriptItems(
      [
        { role: 'user', text: 'Read the readme' },
        { role: 'assistant', text: '# QA project' },
        { role: 'user', text: '' },
      ],
      EMPTY_LOCAL_TURN,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'task', text: 'Read the readme' });
    expect(items[1]).toMatchObject({ kind: 'reply', text: '# QA project', stopReason: null });
  });

  it('puts the turn in flight after the stored transcript, with its tool rows', () => {
    const items = localTranscriptItems([{ role: 'user', text: 'earlier' }], {
      turnId: 'turn-1',
      prompt: 'Reply with exactly: desktop leg ok',
      reply: 'desktop leg ok',
      tools: [
        {
          toolCallId: 'call-1',
          name: 'read_file',
          summary: 'Read README.md',
          output: '# QA',
          isError: false,
        },
      ],
      outcome: null,
      failure: null,
    });

    expect(items.map((item) => item.kind)).toEqual(['task', 'task', 'steps', 'reply']);
    expect(items[2]).toMatchObject({
      kind: 'steps',
      steps: [{ index: 0, toolName: 'read_file', label: 'Read README.md' }],
    });
    expect(items[3]).toMatchObject({ stopReason: null });
  });

  it('renders a failed turn as the sentence, not the CLI line', () => {
    const items = localTranscriptItems([], {
      ...EMPTY_LOCAL_TURN,
      turnId: 'turn-1',
      prompt: 'ping',
      outcome: 'failed',
      failure: {
        code: 'provider_auth_missing',
        message: '[anthropic] Authentication failed: No API key found.',
        provider: 'anthropic',
        action: 'sign_in_provider',
        retryable: false,
      },
    });

    expect(items.at(-1)).toMatchObject({
      kind: 'reply',
      text: 'No Anthropic key on this computer. Run `agi login anthropic` in a terminal, then start a new session.',
      stopReason: 'error',
    });
  });

  it('reads a finished turn into the stop reason the transcript renders', () => {
    expect(localTurnStopReason({ ...EMPTY_LOCAL_TURN, outcome: 'completed' })).toBe('done');
    expect(localTurnStopReason({ ...EMPTY_LOCAL_TURN, outcome: 'failed' })).toBe('error');
    expect(localTurnStopReason({ ...EMPTY_LOCAL_TURN, outcome: 'interrupted' })).toBe('cancelled');
    expect(localTurnStopReason(EMPTY_LOCAL_TURN)).toBeNull();
  });

  it('calls a turn running only while it has an id and no outcome', () => {
    expect(localTurnIsRunning(EMPTY_LOCAL_TURN)).toBe(false);
    expect(localTurnIsRunning({ ...EMPTY_LOCAL_TURN, turnId: 'turn-1' })).toBe(true);
    expect(
      localTurnIsRunning({ ...EMPTY_LOCAL_TURN, turnId: 'turn-1', outcome: 'completed' }),
    ).toBe(false);
  });

  it('shows one line only when every folder reports the same missing runtime', () => {
    const missing = { message: 'The AGI CLI is not on this app’s PATH.', hint: 'Install it.' };

    expect(
      sharedUnavailableLine([
        group({ rootId: 'a', sessions: [], unavailable: missing }),
        group({ rootId: 'b', sessions: [], unavailable: missing }),
      ]),
    ).toBe('The AGI CLI is not on this app’s PATH. Install it.');

    expect(
      sharedUnavailableLine([
        group({ rootId: 'a', sessions: [], unavailable: missing }),
        group({ rootId: 'b' }),
      ]),
    ).toBeNull();

    expect(sharedUnavailableLine([group()])).toBeNull();
  });
});

describe('the folder a new local session starts in', () => {
  const touched = (id: string, at: string): LocalDeveloperSession => ({
    ...session,
    id,
    updatedAt: at,
  });

  it('prefers the folder whose sessions were touched last', () => {
    expect(
      preferredLocalRootId([
        group({ rootId: 'older', sessions: [touched('a', '2026-09-10T09:00:00Z')] }),
        group({ rootId: 'newer', sessions: [touched('b', '2026-09-14T09:00:00Z')] }),
      ]),
    ).toBe('newer');
  });

  it('falls back to an approved folder that has never been used', () => {
    expect(preferredLocalRootId([group({ rootId: 'fresh', sessions: [] })])).toBe('fresh');
  });

  it('never proposes a folder whose runtime cannot start one', () => {
    const missing = { message: 'No CLI.', hint: 'Install it.' };
    expect(
      preferredLocalRootId([group({ rootId: 'blocked', sessions: [], unavailable: missing })]),
    ).toBeNull();
    expect(preferredLocalRootId([])).toBeNull();
  });
});

describe('localFolderChoices', () => {
  it('carries the folder name, its branch and why it cannot run', () => {
    const missing = { message: 'No CLI.', hint: 'Install it.' };
    expect(
      localFolderChoices([
        group({ rootId: 'ok' }),
        group({ rootId: 'blocked', branch: null, unavailable: missing }),
      ]),
    ).toEqual([
      { rootId: 'ok', name: 'qa-project', branch: 'main', unavailable: null },
      { rootId: 'blocked', name: 'qa-project', branch: null, unavailable: 'No CLI. Install it.' },
    ]);
  });

  it('finds one folder by its root, and nothing without a root', () => {
    expect(localFolderChoice([group({ rootId: 'ok' })], 'ok')?.name).toBe('qa-project');
    expect(localFolderChoice([group({ rootId: 'ok' })], null)).toBeNull();
    expect(localFolderChoice([group({ rootId: 'ok' })], 'other')).toBeNull();
  });
});

describe('the model a new local session starts on', () => {
  const at = (id: string, model: string, updatedAt: string): LocalDeveloperSession => ({
    ...session,
    id,
    model,
    updatedAt,
  });
  const host = (id: string) => ({
    id,
    provider: 'qa-provider',
    reachable: true,
    trustMode: 'byok' as const,
    unreachable: null,
  });
  const total = ([, value]: [string, { inputCost: number; outputCost: number }]) =>
    value.inputCost + value.outputCost;
  const priceOf = (id: string): [string, { inputCost: number; outputCost: number }] => {
    const entry = modelsCatalog.models[id];
    if (!entry) throw new Error(`no catalog entry for ${id}`);
    return [id, entry];
  };
  const byTier = (tier: string) =>
    Object.entries(modelsCatalog.models).filter(([, value]) => value.qualityTier === tier);
  const topTierId = byTier('best').sort((a, b) => total(b) - total(a))[0]?.[0] as string;
  const cheapId = byTier('fast')
    .filter(([, value]) => value.inputCost > 0)
    .sort((a, b) => total(a) - total(b))[0]?.[0] as string;

  it('reads a real top tier route and a real cheap one out of the catalog', () => {
    expect(topTierId).toBeTruthy();
    expect(cheapId).toBeTruthy();
    expect(total(priceOf(cheapId))).toBeLessThan(total(priceOf(topTierId)));
  });

  it('takes the folder`s last used model when the host can still reach it', () => {
    const runtimeWithBoth: DeveloperRuntimeModels = {
      models: [],
      hostModels: [host(topTierId), host(cheapId)],
      defaultModelId: topTierId,
      managedSignedIn: false,
    };

    expect(
      startingModelId(runtimeWithBoth, [
        at('a', topTierId, '2026-09-10T09:00:00Z'),
        at('b', cheapId, '2026-09-14T09:00:00Z'),
      ]),
    ).toBe(cheapId);
  });

  it('never makes a top tier route the silent default of a fresh folder', () => {
    const runtimeTopDefault: DeveloperRuntimeModels = {
      models: [],
      hostModels: [host(topTierId), host(cheapId)],
      defaultModelId: topTierId,
      managedSignedIn: false,
    };

    expect(startingModelId(runtimeTopDefault, [])).toBe(cheapId);
  });

  it('takes the host default over the cheapest when it is not top tier', () => {
    const runtimeCheapDefault: DeveloperRuntimeModels = {
      models: [],
      hostModels: [host(topTierId), host(cheapId)],
      defaultModelId: cheapId,
      managedSignedIn: false,
    };

    expect(startingModelId(runtimeCheapDefault, [])).toBe(cheapId);
  });

  it('offers nothing when the host can reach nothing', () => {
    expect(
      startingModelId(
        { models: [], hostModels: [], defaultModelId: null, managedSignedIn: false },
        [],
      ),
    ).toBeUndefined();
  });
});

describe('the test command a folder declares', () => {
  const scripts = (test: string) => JSON.stringify({ scripts: { test } });

  it('runs the package test script with the package manager the lockfile names', () => {
    expect(detectTestCommand(['package.json', 'pnpm-lock.yaml'], scripts('vitest'))).toBe(
      'pnpm test',
    );
    expect(detectTestCommand(['package.json', 'yarn.lock'], scripts('jest'))).toBe('yarn test');
    expect(detectTestCommand(['package.json', 'bun.lock'], scripts('bun test'))).toBe(
      'bun run test',
    );
    expect(detectTestCommand(['package.json'], scripts('node --test'))).toBe('npm test');
  });

  it('ignores the placeholder npm writes and a manifest it cannot read', () => {
    const placeholder = scripts('echo "Error: no test specified" && exit 1');
    expect(detectTestCommand(['package.json'], placeholder)).toBeNull();
    expect(detectTestCommand(['package.json', 'Cargo.toml'], '{not json')).toBe('cargo test');
  });

  it('falls back to the language toolchain the folder declares', () => {
    expect(detectTestCommand(['Cargo.toml'], null)).toBe('cargo test');
    expect(detectTestCommand(['go.mod'], null)).toBe('go test ./...');
    expect(detectTestCommand(['pyproject.toml'], null)).toBe('pytest');
    expect(detectTestCommand(['README.md'], null)).toBeNull();
  });
});
