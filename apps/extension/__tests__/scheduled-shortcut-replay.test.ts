import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ExtensionResponse, SavedShortcut } from '../src/types';
import { ORIGIN_EXTENSION_PAGE } from '../src/background/policy';
import {
  replayScheduledShortcut,
  ScheduledShortcutReplayCancelledError,
  ScheduledShortcutReplayDeferredError,
  type ScheduledShortcutReplayDependencies,
} from '../src/features/background/scheduled-shortcut-replay';

const origin = 'https://example.com';
const task = {
  id: 'scheduled-1',
  shortcutId: 'recording-1',
  createdByOrigin: ORIGIN_EXTENSION_PAGE,
};
function recording(): SavedShortcut {
  return {
    id: 'recording-1',
    name: 'Recording',
    createdAt: 1,
    createdByOrigin: ORIGIN_EXTENSION_PAGE,
    startUrl: origin,
    actions: [{ id: 'click-1', type: 'click', selector: '#go' }],
  };
}
function setup() {
  const shortcut = recording();
  const state = { current: true };
  const forward = vi.fn(async () => ({ success: true }) as ExtensionResponse);
  const dependencies: ScheduledShortcutReplayDependencies = {
    isCurrent: () => state.current,
    loadShortcuts: async () => [shortcut],
    queryActiveTab: async () => ({ id: 7 }),
    getTab: async () => ({ url: `${origin}/page` }),
    loadPolicy: async () => ({ admin: null, userAllowlist: [origin] }),
    liveGrantedOrigins: () => [],
    forward,
  };
  return { dependencies, forward, state, shortcut };
}
function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('scheduled-only recorded replay', () => {
  for (const step of ['loadShortcuts', 'queryActiveTab', 'getTab', 'loadPolicy'] as const) {
    it(`withholds dispatch when the original lease is lost during ${step}`, async () => {
      const { dependencies, state, forward } = setup();
      const entered = latch();
      const release = latch();
      if (step === 'loadShortcuts')
        dependencies.loadShortcuts = async () => {
          entered.resolve();
          await release.promise;
          return [recording()];
        };
      if (step === 'queryActiveTab')
        dependencies.queryActiveTab = async () => {
          entered.resolve();
          await release.promise;
          return { id: 7 };
        };
      if (step === 'getTab')
        dependencies.getTab = async () => {
          entered.resolve();
          await release.promise;
          return { url: origin };
        };
      if (step === 'loadPolicy')
        dependencies.loadPolicy = async () => {
          entered.resolve();
          await release.promise;
          return { admin: null, userAllowlist: [origin] };
        };
      const pending = replayScheduledShortcut(task, dependencies);
      await entered.promise;
      const rejection = expect(pending).rejects.toBeInstanceOf(
        ScheduledShortcutReplayCancelledError,
      );
      state.current = false;
      release.resolve();
      await rejection;
      expect(forward).not.toHaveBeenCalled();
    });
  }

  it('defers unreadable policy even with live grants, without sending', async () => {
    const { dependencies, forward } = setup();
    dependencies.loadPolicy = async () => null;
    dependencies.liveGrantedOrigins = () => [origin];
    await expect(replayScheduledShortcut(task, dependencies)).rejects.toBeInstanceOf(
      ScheduledShortcutReplayDeferredError,
    );
    expect(forward).not.toHaveBeenCalled();
  });

  it('defers failed shortcut reads rather than treating them as missing', async () => {
    const { dependencies, forward } = setup();
    dependencies.loadShortcuts = async () => {
      throw new Error('unreadable');
    };
    await expect(replayScheduledShortcut(task, dependencies)).rejects.toBeInstanceOf(
      ScheduledShortcutReplayDeferredError,
    );
    expect(forward).not.toHaveBeenCalled();
  });

  it('blocks a revoked creator and a revoked target without destructive callbacks', async () => {
    const { dependencies, shortcut, forward } = setup();
    shortcut.createdByOrigin = 'https://revoked.example';
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: false });
    shortcut.createdByOrigin = ORIGIN_EXTENSION_PAGE;
    dependencies.loadPolicy = async () => ({ admin: null, userAllowlist: [] });
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: false });
    expect(forward).not.toHaveBeenCalled();
    expect(Object.keys(dependencies).some((key) => /delete|remove/i.test(key))).toBe(false);
  });

  it('binds to tabs.get rather than the earlier selected tab', async () => {
    const { dependencies, forward } = setup();
    dependencies.getTab = async () => ({ url: 'https://other.example/page' });
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: false });
    expect(forward).not.toHaveBeenCalled();
  });

  it('allows live grants only inside organization policy', async () => {
    const { dependencies, forward } = setup();
    dependencies.loadPolicy = async () => ({ admin: null, userAllowlist: [] });
    dependencies.liveGrantedOrigins = () => [origin];
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: true });
    expect(forward).toHaveBeenCalledTimes(1);
    forward.mockClear();
    dependencies.loadPolicy = async () => ({
      admin: { version: 1, blocklist: [{ pattern: origin }], allowlist: [] },
      userAllowlist: [],
    });
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: false });
    expect(forward).not.toHaveBeenCalled();
  });

  it('refuses a prompt replacement and invalid actions without cloud fallback', async () => {
    const { dependencies, shortcut, forward } = setup();
    shortcut.actions = [];
    shortcut.prompt = 'A cloud prompt';
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: false });
    shortcut.actions = [{ id: 'bad', type: 'unsupported' }];
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: false });
    expect(forward).not.toHaveBeenCalled();
  });

  it('dispatches one copied action snapshot with actions taking precedence over prompt', async () => {
    const { dependencies, shortcut, forward } = setup();
    shortcut.prompt = 'Never send this to chat';
    dependencies.queryActiveTab = async () => {
      shortcut.actions[0]!.selector = '#replacement';
      return { id: 7 };
    };
    expect(await replayScheduledShortcut(task, dependencies)).toMatchObject({ success: true });
    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'RUN_PAGE_ACTIONS',
        actions: [{ id: 'click-1', type: 'click', selector: '#go' }],
      }),
    );
  });

  it('checks the original lease again at the actual forwarding boundary', async () => {
    const { dependencies, state, forward } = setup();
    dependencies.liveGrantedOrigins = () => {
      state.current = false;
      return [];
    };
    await expect(replayScheduledShortcut(task, dependencies)).rejects.toBeInstanceOf(
      ScheduledShortcutReplayCancelledError,
    );
    expect(forward).not.toHaveBeenCalled();
  });

  it('keeps interactive replay separate and preserves the synchronous forwarding boundary', () => {
    const source = readFileSync(new URL('../src/background.ts', import.meta.url), 'utf8');
    expect(source).toContain("case 'REPLAY_SHORTCUT':\n      return handleReplayShortcut");
    const scheduled = source.slice(
      source.indexOf('async function executeScheduledTask('),
      source.indexOf('// A tab-originated message'),
    );
    expect(scheduled).toContain('await replayScheduledShortcut(task, {');
    expect(scheduled).not.toContain('await handleReplayShortcut(');
    const forwarding = source.slice(
      source.indexOf('async function forwardToContentScript('),
      source.indexOf('/**\n * `connectedToDesktop`'),
    );
    expect(forwarding).toContain(
      'const response = await withTimeout(\n      chrome.tabs.sendMessage(tabId, message),',
    );
  });
});
