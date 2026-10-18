import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string): string =>
  readFileSync(resolve(here, '..', relativePath), 'utf8');

describe('computer-use options trust boundary', () => {
  const options = read('src/options.ts');
  const background = read('src/background.ts');
  const session = read('src/features/computer-use/debuggerSession.ts');

  afterEach(() => vi.unstubAllGlobals());

  it('discloses CDP, approved-site scope, default approval, and the bounded driver', () => {
    expect(options).toContain('Chrome DevTools Protocol (CDP)');
    expect(options).toContain('only after you start a run on an approved site');
    expect(options).toContain('Ask before acting is on by default');
    expect(options).toContain('does not expose an unrestricted CDP developer mode');
  });

  it('keeps the disclosure tied to the enforced default and approved-run detach lifecycle', async () => {
    expect(background).toMatch(/askPref\[ASK_BEFORE_ACTING_KEY\]\s*!==\s*false/);
    expect(session).toMatch(
      /await fn\(\);[\s\S]*finally \{[\s\S]*await releaseDebugger\(tabId, session\)/,
    );
    expect(options).toContain('then detaches when the run ends');
    const detach = vi.fn((_target: unknown, callback: () => void) => callback());
    vi.stubGlobal('chrome', {
      runtime: {},
      debugger: {
        attach: vi.fn((_target: unknown, _version: string, callback: () => void) => callback()),
        detach,
        onDetach: { addListener: vi.fn() },
        onEvent: { addListener: vi.fn() },
      },
    });
    const { acquireDebugger, releaseDebugger, debuggerHoldCount } =
      await import('../src/features/computer-use/debuggerSession');
    await acquireDebugger(313);
    await acquireDebugger(313);
    await releaseDebugger(313);
    expect(debuggerHoldCount(313)).toBe(1);
    expect(detach).not.toHaveBeenCalled();
    await releaseDebugger(313);
    expect(debuggerHoldCount(313)).toBe(0);
    expect(detach).toHaveBeenCalledOnce();
  });
});
