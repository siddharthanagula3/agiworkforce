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
  localModelChoices,
  localFailureAction,
  localModelLabel,
  localTurnFailureSentence,
  startingModelId,
  localSessionContext,
  localSessionOriginLabel,
  localTranscriptItems,
  localTurnIsRunning,
  localTurnStopReason,
  newSessionLabel,
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
  defaultModelId: CONFIGURED_MODEL,
  managedSignedIn: false,
};

describe('local code surface', () => {
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
