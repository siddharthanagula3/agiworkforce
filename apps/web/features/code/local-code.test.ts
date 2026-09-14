import { describe, expect, it } from 'vitest';
import type {
  DeveloperRuntimeModels,
  DeveloperSession,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import {
  EMPTY_LOCAL_TURN,
  localModelChoices,
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

const session: DeveloperSession = {
  id: 'thread-1',
  rootId: 'root-1',
  title: 'Quote the readme',
  cwd: '/work/qa-project',
  model: 'a-model',
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
    { id: 'qwen2.5:1.5b', provider: 'ollama', local: true },
    { id: 'smollm2:135m', provider: 'ollama', local: true },
  ],
  defaultModelId: 'claude-fable-5-1',
  managedSignedIn: false,
};

describe('local code surface', () => {
  it('offers what the folder has used, then what is installed, then the default', () => {
    const choices = localModelChoices(runtime, [
      { ...session, model: 'deepseek-v4-flash' },
      { ...session, id: 'b', model: 'deepseek-v4-flash' },
    ]);

    expect(choices.map((choice) => [choice.id, choice.evidence])).toEqual([
      ['deepseek-v4-flash', 'used-here'],
      ['qwen2.5:1.5b', 'installed'],
      ['smollm2:135m', 'installed'],
      ['claude-fable-5-1', 'configured'],
    ]);
    expect(choices[0]?.label).toBe('DeepSeek V4 Flash');
  });

  it('starts a session on the best-evidenced model rather than the configured default', () => {
    expect(startingModelId(runtime, [{ ...session, model: 'deepseek-v4-flash' }])).toBe(
      'deepseek-v4-flash',
    );
    expect(startingModelId(runtime, [])).toBe('qwen2.5:1.5b');
    expect(startingModelId({ ...runtime, models: [] }, [])).toBe('claude-fable-5-1');
    expect(startingModelId(null, [])).toBeUndefined();
  });

  it('names a model once, however many sessions used it', () => {
    const choices = localModelChoices(
      {
        models: [{ id: 'deepseek-v4-flash', provider: 'deepseek', local: false }],
        defaultModelId: 'deepseek-v4-flash',
        managedSignedIn: true,
      },
      [{ ...session, model: 'deepseek-v4-flash' }],
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
    expect(localModelLabel('deepseek-v4-flash')).toBe('DeepSeek V4 Flash');
    expect(localModelLabel(null)).toBeNull();
  });

  it('keeps the id of a model the catalog does not carry', () => {
    expect(localModelLabel('ollama/some-local-build')).toBe('ollama/some-local-build');
  });

  it('reads the folder, branch, model and trust into one line', () => {
    expect(localSessionContext({ ...session, model: 'deepseek-v4-flash' }, group())).toBe(
      'qa-project · main · DeepSeek V4 Flash · Your key',
    );
  });

  it('drops a branch a folder does not have rather than printing its absence', () => {
    expect(
      localSessionContext({ ...session, model: 'deepseek-v4-flash' }, group({ branch: null })),
    ).toBe('qa-project · DeepSeek V4 Flash · Your key');
  });

  it('says a missing key in the desktop\u2019s own words', () => {
    expect(
      localTurnFailureSentence(
        '[anthropic] Authentication failed: No API key found. Run agi login anthropic or set ANTHROPIC_API_KEY.',
        null,
      ),
    ).toBe(
      'No Anthropic key on this computer. Add one in Settings, or run `agi login anthropic` in a terminal.',
    );
  });

  it('takes the provider from the session when the line carries none', () => {
    expect(localTurnFailureSentence('Authentication failed: No API key found.', 'deepseek')).toBe(
      'No DeepSeek key on this computer. Add one in Settings, or run `agi login deepseek` in a terminal.',
    );
  });

  it('keeps a failure that is not about a key, without the bracketed provider', () => {
    expect(localTurnFailureSentence('[deepseek] The model refused the request.', 'deepseek')).toBe(
      'The model refused the request.',
    );
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
      error: null,
    });

    expect(items.map((item) => item.kind)).toEqual(['task', 'task', 'steps', 'reply']);
    expect(items[2]).toMatchObject({
      kind: 'steps',
      steps: [{ index: 0, toolName: 'read_file', label: 'Read README.md' }],
    });
    expect(items[3]).toMatchObject({ stopReason: null });
  });

  it('renders a failed turn as the sentence, not the CLI line', () => {
    const items = localTranscriptItems(
      [],
      {
        ...EMPTY_LOCAL_TURN,
        turnId: 'turn-1',
        prompt: 'ping',
        outcome: 'failed',
        error:
          '[anthropic] Authentication failed: No API key found. Run agi login anthropic or set ANTHROPIC_API_KEY.',
      },
      'anthropic',
    );

    expect(items.at(-1)).toMatchObject({
      kind: 'reply',
      text: 'No Anthropic key on this computer. Add one in Settings, or run `agi login anthropic` in a terminal.',
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
