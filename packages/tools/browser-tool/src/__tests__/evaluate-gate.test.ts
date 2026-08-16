
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserAction } from '../types';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runBrowserAction evaluate gate', () => {
  it('refuses evaluate when allowEvaluate is unset (no profile launched)', async () => {
    let openCalled = false;
    vi.doMock('../profile', async () => {
      const actual = await vi.importActual<typeof import('../profile')>('../profile');
      return {
        ...actual,
        openProfile: vi.fn(async () => {
          openCalled = true;
          throw new Error('openProfile must not be called when evaluate is gated');
        }),
        closeProfile: vi.fn(async () => {}),
      };
    });

    const { runBrowserAction } = await import('../index');
    const action: BrowserAction = {
      kind: 'evaluate',
      script: 'document.cookie',
    };

    const result = await runBrowserAction(action);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toMatch(/disabled by default/i);
    }
    expect(openCalled).toBe(false);
  });

  it('also refuses evaluate when allowEvaluate is explicitly false', async () => {
    let openCalled = false;
    vi.doMock('../profile', async () => {
      const actual = await vi.importActual<typeof import('../profile')>('../profile');
      return {
        ...actual,
        openProfile: vi.fn(async () => {
          openCalled = true;
          throw new Error('openProfile must not be called when evaluate is gated');
        }),
        closeProfile: vi.fn(async () => {}),
      };
    });

    const { runBrowserAction } = await import('../index');
    const result = await runBrowserAction(
      { kind: 'evaluate', script: 'document.cookie' },
      { allowEvaluate: false },
    );
    expect(result.isError).toBe(true);
    expect(openCalled).toBe(false);
  });

  it('runs evaluate when allowEvaluate is true', async () => {
    let executedScript: string | null = null;
    const fakePage = {
      url: () => 'https://example.test/',
      evaluate: async (script: string) => {
        executedScript = script;
        return { ok: true, ran: script };
      },
    };
    vi.doMock('../profile', async () => {
      const actual = await vi.importActual<typeof import('../profile')>('../profile');
      return {
        ...actual,
        openProfile: vi.fn(async () => fakePage),
        closeProfile: vi.fn(async () => {}),
      };
    });

    const { runBrowserAction } = await import('../index');
    const result = await runBrowserAction(
      { kind: 'evaluate', script: '1 + 1' },
      { allowEvaluate: true },
    );
    expect(result.isError).toBeUndefined();
    expect(executedScript).toBe('1 + 1');
    expect(result.content[0]?.type).toBe('text');
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toContain('"ran":"1 + 1"');
    }
  });
});
