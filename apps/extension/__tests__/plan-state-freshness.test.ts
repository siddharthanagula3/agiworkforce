import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getManagedModelAccess } from '../src/features/cloud-bridge/freeTrialClient';

const panelSource = readFileSync(resolve(process.cwd(), 'src/side_panel.ts'), 'utf8');

function slice(from: string, to: string): string {
  const start = panelSource.indexOf(from);
  const end = panelSource.indexOf(to, start);
  if (start < 0 || end < start) throw new Error(`${from} was not found`);
  return panelSource.slice(start, end);
}

type State = 'loading' | 'ready' | 'unavailable' | 'signed_out';

function accountRefresh(serverStates: State[]) {
  const document = { visibilityState: 'visible' };
  const ctx = { isStreaming: false };
  let tick: (() => void) | undefined;
  const fetches: State[] = [];
  let harness: { onReturn(): void; setState(value: State): void; read(): State };
  const refreshCloudAccountUI = vi.fn(async () => {
    const next = serverStates.shift() ?? 'ready';
    fetches.push(next);
    harness.setState(next);
  });
  const compiled = ts.transpileModule(
    `let managedCloudChatState = 'loading';
let lastAccountRefreshOnReturn = 0;
${slice('function refreshAccountOnReturn', "document.addEventListener('visibilitychange'")}
return {
  onReturn: refreshAccountOnReturn,
  setState: (value) => { managedCloudChatState = value; },
  read: () => managedCloudChatState,
};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned panel code inside this isolated test fixture.
  harness = new Function(
    'document',
    '_ctx',
    'refreshOpenAccountChatOnReturn',
    'refreshCloudAccountUI',
    'ACCOUNT_REFRESH_ON_RETURN_MS',
    'ACCOUNT_REFRESH_WHILE_OPEN_MS',
    'setInterval',
    compiled.outputText,
  )(
    document,
    ctx,
    () => undefined,
    refreshCloudAccountUI,
    60_000,
    180_000,
    (fn: () => void) => {
      tick = fn;
      return 1;
    },
  );
  return {
    harness: harness!,
    fetches,
    refreshCloudAccountUI,
    ctx,
    tickInterval: () => tick?.(),
  };
}

afterEach(() => vi.useRealTimers());

describe('the panel shows the plan the server has now', () => {
  it('re-checks on return while a billing gate blocks the composer, so a renewed plan unblocks it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const h = accountRefresh(['unavailable', 'ready']);
    h.harness.onReturn();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.harness.read()).toBe('unavailable');
    vi.setSystemTime(1_005_000);
    h.harness.onReturn();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.fetches).toEqual(['unavailable', 'ready']);
    expect(h.harness.read()).toBe('ready');
  });

  it('still throttles focus refreshes while everything works', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const h = accountRefresh(['ready', 'ready']);
    h.harness.onReturn();
    await Promise.resolve();
    await Promise.resolve();
    vi.setSystemTime(2_005_000);
    h.harness.onReturn();
    await Promise.resolve();
    expect(h.refreshCloudAccountUI).toHaveBeenCalledTimes(1);
  });

  it('re-reads the plan every few minutes while the panel is open, but not mid-answer', async () => {
    const h = accountRefresh(['ready', 'ready']);
    h.tickInterval();
    await Promise.resolve();
    expect(h.refreshCloudAccountUI).toHaveBeenCalledTimes(1);
    h.ctx.isStreaming = true;
    h.tickInterval();
    await Promise.resolve();
    expect(h.refreshCloudAccountUI).toHaveBeenCalledTimes(1);
    expect(panelSource).toContain(
      'setInterval(refreshAccountWhileOpen, ACCOUNT_REFRESH_WHILE_OPEN_MS)',
    );
  });

  it('re-checks the account when a turn is refused for the plan', () => {
    expect(panelSource).toMatch(
      /chunk\.errorCode === 'plan_required'\s*\)\s*\{\s*void refreshCloudAccountUI\(\);/,
    );
  });

  it('never reads the plan from the HTTP cache', async () => {
    const fetchImpl = vi.fn(
      async (url: string) =>
        new Response(
          url.includes('usage')
            ? JSON.stringify({ windows: [] })
            : JSON.stringify({ data: [], subscription_tier: 'max_15x' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchImpl);
    try {
      await getManagedModelAccess('token').catch(() => undefined);
      expect(fetchImpl).toHaveBeenCalled();
      for (const call of fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>) {
        expect(call[1].cache).toBe('no-store');
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
