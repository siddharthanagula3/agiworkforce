import { renderShortcutPrompt } from '../src/features/side-panel/pageCommands';
import {
  normalizeShortcutStartUrl,
  validateShortcutReplayTarget,
} from '../src/features/shortcuts/origin';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { getRoutingSlotModel } from '@agiworkforce/types';
import { ORIGIN_EXTENSION_PAGE } from '../src/background/policy';
import { TASK_PROMPT_MAX_CHARS } from '../src/features/background/tasks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleSaveShortcut,
  loadShortcuts,
  planShortcutReplay,
} from '../src/features/background/shortcuts';
import type { RunPageAction } from '../src/types';

const action: RunPageAction = { id: 'a1', type: 'CLICK', selector: '#go' };

const chromeMock = {
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
  storage: {
    local: {
      get: vi.fn((_key: string, callback: (result: Record<string, unknown>) => void) =>
        callback({ agi_saved_shortcuts: [] }),
      ),
      set: vi.fn(async () => undefined),
    },
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

beforeEach(() => {
  chromeMock.runtime.lastError = undefined;
  vi.clearAllMocks();
});

describe('planShortcutReplay', () => {
  it('replays a recorded page-action shortcut via the actions path', () => {
    expect(planShortcutReplay({ actions: [action], prompt: undefined })).toEqual({
      kind: 'actions',
    });
  });

  it('routes a prompt shortcut (empty actions + prompt) through the chat path', () => {
    expect(planShortcutReplay({ actions: [], prompt: 'summarize this page' })).toEqual({
      kind: 'prompt',
      prompt: 'summarize this page',
    });
  });

  it('trims the prompt and still routes to chat', () => {
    expect(planShortcutReplay({ actions: [], prompt: '  do the thing  ' })).toEqual({
      kind: 'prompt',
      prompt: 'do the thing',
    });
  });

  it('reports empty when there are neither actions nor a prompt (no fake success)', () => {
    expect(planShortcutReplay({ actions: [], prompt: undefined })).toEqual({ kind: 'empty' });
    expect(planShortcutReplay({ actions: [], prompt: '   ' })).toEqual({ kind: 'empty' });
  });

  it('prefers recorded actions when a shortcut somehow carries both', () => {
    expect(planShortcutReplay({ actions: [action], prompt: 'ignored' })).toEqual({
      kind: 'actions',
    });
  });
});

describe('shortcut storage authority', () => {
  it('treats a storage failure as unknown state instead of an authoritative empty list', async () => {
    chromeMock.runtime.lastError = { message: 'shortcut storage unavailable' };

    await expect(loadShortcuts()).rejects.toThrow('shortcut storage unavailable');
  });
});

describe('recorded shortcut save binding', () => {
  it('refuses to persist page actions without a valid web origin', async () => {
    const result = await handleSaveShortcut({
      type: 'SAVE_SHORTCUT',
      name: 'Unsafe legacy recording',
      actions: [action],
    });

    expect(result.success).toBe(false);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });

  it('persists only the canonical origin for a recorded page workflow', async () => {
    const result = await handleSaveShortcut({
      type: 'SAVE_SHORTCUT',
      name: 'Bound recording',
      actions: [action],
      startUrl: 'https://app.example.test/private/path?token=secret#step',
    });

    expect(result.success).toBe(true);
    const stored = chromeMock.storage.local.set.mock.calls[0]?.[0] as {
      agi_saved_shortcuts?: Array<{ startUrl?: string }>;
    };
    expect(stored.agi_saved_shortcuts?.[0]?.startUrl).toBe('https://app.example.test');
  });
});

function promptReplayHarness(recorded = false) {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
    'utf8',
  );
  const program = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = program.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'handleReplayShortcut',
  );
  if (!declaration) throw new Error('The real shortcut replay controller is missing');
  const handleChatMessage = vi.fn(
    async (_message: Record<string, unknown>, _sender: unknown, _delivery?: unknown) => ({
      status: 'success',
    }),
  );
  const tabs = {
    query: vi.fn(async () => [
      { id: 1, url: 'chrome-extension://extension-fixture/src/options.html' },
    ]),
    get: vi.fn(async (id: number) => ({ id, url: 'https://recorded.example/form' })),
  };
  const forwardToContentScript = vi.fn(async () => ({ success: true }));
  const dependencies = {
    validateShortcutReplayTarget,
    normalizeShortcutStartUrl,
    forwardToContentScript,
    releaseDataOfOtherAccounts: vi.fn(async () => undefined),
    loadShortcuts: async () => [
      {
        id: 'prompt-1',
        name: 'QA prompt',
        prompt: 'Reply only with PINE-RUN-{{input}}.',
        actions: recorded ? [{ type: 'input', selector: '#name', value: 'Saved' }] : [],
        startUrl: recorded ? 'https://recorded.example' : undefined,
        createdByOrigin: ORIGIN_EXTENSION_PAGE,
      },
    ],
    ORIGIN_EXTENSION_PAGE,
    isOriginApprovedForAutomation: () => true,
    logger: { warn: vi.fn() },
    handleDeleteShortcut: vi.fn(),
    planShortcutReplay,
    renderShortcutPrompt,
    TASK_PROMPT_MAX_CHARS,
    SHORTCUT_REPLAY_CLIENT_ID: 'shortcut-replay-fixture',
    createBackgroundChatDelivery: () => undefined,
    handleChatMessage,
    chrome: { runtime: { id: 'extension-fixture' }, tabs },
  };
  const compiled = ts.transpileModule(
    `${declaration.getText(program)};return handleReplayShortcut;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes the checked-in replay controller with isolated delivery and chat transport.
  const run = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as (message: Record<string, unknown>, owner?: unknown, notify?: boolean) => Promise<unknown>;
  return {
    handleChatMessage,
    run,
    tabs,
    forwardToContentScript,
    releaseDataOfOtherAccounts: dependencies.releaseDataOfOtherAccounts,
  };
}

describe('recorded replay account authority', () => {
  it('releases another account recordings before it looks the shortcut up', async () => {
    const h = promptReplayHarness(true);
    await h.run({ type: 'REPLAY_SHORTCUT', shortcutId: 'missing' });
    expect(h.releaseDataOfOtherAccounts).toHaveBeenCalledTimes(1);
  });
});

describe('prompt replay model selection', () => {
  it('honors an explicit caller model instead of replacing it with Auto', async () => {
    const h = promptReplayHarness(),
      selection = getRoutingSlotModel('general_fast');
    await h.run(
      { type: 'REPLAY_SHORTCUT', shortcutId: 'prompt-1', modelSelection: selection },
      undefined,
      false,
    );
    expect(h.handleChatMessage.mock.calls[0]?.[0]).toMatchObject({ modelSelection: selection });
  });
  it('uses the same empty-input expansion as a slash command instead of forwarding literal braces', async () => {
    const h = promptReplayHarness();
    await h.run({ type: 'REPLAY_SHORTCUT', shortcutId: 'prompt-1' }, undefined, false);
    expect(h.handleChatMessage.mock.calls[0]?.[0]).toMatchObject({
      text: 'Reply only with PINE-RUN-.',
    });
  });
  it('preserves the existing Auto default and owner on internal/scheduled calls without an override', async () => {
    const h = promptReplayHarness(),
      owner = { accountId: 'account-1', authIncarnation: 'session-1' };
    await h.run({ type: 'REPLAY_SHORTCUT', shortcutId: 'prompt-1' }, owner, false);
    expect(h.handleChatMessage.mock.calls[0]?.[0]).toMatchObject({ modelSelection: 'auto', owner });
  });
  it.each([17, '', '   ', {}])(
    'refuses malformed explicit selection %j before chat admission',
    async (modelSelection) => {
      const h = promptReplayHarness();
      expect(
        await h.run(
          { type: 'REPLAY_SHORTCUT', shortcutId: 'prompt-1', modelSelection },
          undefined,
          false,
        ),
      ).toMatchObject({ success: false });
      expect(h.handleChatMessage).not.toHaveBeenCalled();
    },
  );
});

describe('recorded replay target authority', () => {
  it('uses the caller-selected website while Options is active and binds content execution to its origin', async () => {
    const h = promptReplayHarness(true);
    expect(
      await h.run({ type: 'REPLAY_SHORTCUT', shortcutId: 'prompt-1', tabId: 7 }, undefined, false),
    ).toMatchObject({ success: true });
    expect(h.tabs.get).toHaveBeenCalledWith(7);
    expect(h.tabs.query).not.toHaveBeenCalled();
    expect(h.forwardToContentScript).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'RUN_PAGE_ACTIONS',
        expectedOrigin: 'https://recorded.example',
      }),
    );
    expect(h.handleChatMessage).not.toHaveBeenCalled();
  });
  it('refuses a selected tab that has navigated to another site', async () => {
    const h = promptReplayHarness(true);
    h.tabs.get.mockResolvedValueOnce({ id: 7, url: 'https://different.example' });
    expect(
      await h.run({ type: 'REPLAY_SHORTCUT', shortcutId: 'prompt-1', tabId: 7 }, undefined, false),
    ).toMatchObject({ success: false });
    expect(h.forwardToContentScript).not.toHaveBeenCalled();
  });
  it('refuses a closed selected tab without falling back to the active one', async () => {
    const h = promptReplayHarness(true);
    h.tabs.get.mockRejectedValueOnce(new Error('No tab with id'));
    expect(
      await h.run({ type: 'REPLAY_SHORTCUT', shortcutId: 'prompt-1', tabId: 7 }, undefined, false),
    ).toMatchObject({ success: false });
    expect(h.forwardToContentScript).not.toHaveBeenCalled();
    expect(h.tabs.query).not.toHaveBeenCalled();
  });
});
