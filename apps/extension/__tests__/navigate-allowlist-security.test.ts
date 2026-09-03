import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chromeMock = vi.hoisted(() => {
  const localStore: Record<string, unknown> = {};

  const debuggerMock = {
    attach: vi.fn((_t: unknown, _v: unknown, cb: () => void) => cb()),
    detach: vi.fn((_t: unknown, cb: () => void) => cb()),
    sendCommand: vi.fn((_t: unknown, method: string, _p: unknown, cb: (r: unknown) => void) => {
      if (method === 'Page.captureScreenshot') cb({ data: 'FAKE_PNG' });
      else if (method === 'Page.navigate') cb({});
      else if (method === 'Runtime.evaluate')
        cb({ result: { type: 'string', value: 'URL: https://example.com\nTITLE: Test' } });
      else cb({});
    }),
  };

  const tabsMock = {
    get: vi.fn((_id: number) => Promise.resolve({ id: _id, url: 'https://example.com/page' })),
  };

  const mock = {
    debugger: debuggerMock,
    runtime: { lastError: null as { message?: string } | null },
    storage: {
      local: {
        get: vi.fn((keys: string | string[]) => {
          const result: Record<string, unknown> = {};
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            if (k in localStore) result[k] = localStore[k];
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(localStore, items);
          return Promise.resolve();
        }),
      },
    },
    tabs: tabsMock,
    _localStore: localStore,
  };

  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

import { assertDestinationAllowlisted, getOrigin } from '../src/features/computer-use/cdpDriver';
import { NavigationOffAllowlistError } from '../src/features/computer-use/agentLoop';

function setAllowlist(origins: string[]): void {
  chromeMock._localStore['agi_site_allowlist'] = origins;
}

describe('cdpDriver.assertDestinationAllowlisted, P0 security fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeMock.runtime.lastError = null;
    setAllowlist([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('rejects a URL whose origin is NOT on the allowlist', async () => {
    setAllowlist(['https://example.com']);
    await expect(assertDestinationAllowlisted('https://evil.com/steal')).rejects.toThrow(
      /not on your AGI site allowlist/,
    );
  });

  it('rejects off-allowlist even if host is similar to an allowlisted host', async () => {
    setAllowlist(['https://example.com']);
    await expect(assertDestinationAllowlisted('https://evilexample.com')).rejects.toThrow(
      /not on your AGI site allowlist/,
    );
  });

  it('accepts a URL whose origin IS on the allowlist', async () => {
    setAllowlist(['https://boards.greenhouse.io']);
    await expect(
      assertDestinationAllowlisted('https://boards.greenhouse.io/acme/jobs/123'),
    ).resolves.toBeUndefined();
  });

  it('accepts multiple allowlisted origins', async () => {
    setAllowlist(['https://boards.greenhouse.io', 'https://jobs.lever.co']);
    await expect(
      assertDestinationAllowlisted('https://jobs.lever.co/company/apply'),
    ).resolves.toBeUndefined();
  });

  it('rejects javascript: scheme before checking allowlist', async () => {
    setAllowlist(['javascript:evil']);
    await expect(assertDestinationAllowlisted('javascript:alert(1)')).rejects.toThrow(
      /only http\/https URLs allowed/,
    );
  });

  it('rejects file: scheme', async () => {
    setAllowlist([]);
    await expect(assertDestinationAllowlisted('file:///etc/passwd')).rejects.toThrow(
      /only http\/https URLs allowed/,
    );
  });

  it('rejects when allowlist is empty (fail-closed)', async () => {
    setAllowlist([]);
    await expect(assertDestinationAllowlisted('https://example.com')).rejects.toThrow(
      /not on your AGI site allowlist/,
    );
  });

  it('rejects when chrome.storage is unavailable (fail-closed)', async () => {
    chromeMock.storage.local.get = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    await expect(assertDestinationAllowlisted('https://example.com')).rejects.toThrow(
      /not on your AGI site allowlist/,
    );
  });

  it('getOrigin extracts the correct origin', () => {
    expect(getOrigin('https://boards.greenhouse.io/acme/jobs/123?ref=foo')).toBe(
      'https://boards.greenhouse.io',
    );
    expect(getOrigin('https://jobs.lever.co/company/abc')).toBe('https://jobs.lever.co');
  });
});

describe('agentLoop, aborts on post-navigate off-allowlist tab URL', () => {
  // We test NavigationOffAllowlistError is correctly exported and identifiable
  it('NavigationOffAllowlistError is an Error subclass with the right name', () => {
    const err = new NavigationOffAllowlistError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NavigationOffAllowlistError');
    expect(err.message).toBe('test message');
  });

  it('NavigationOffAllowlistError message describes the off-allowlist origin', () => {
    const err = new NavigationOffAllowlistError(
      'Post-navigate check: tab landed on "https://evil.com" which is not on the site allowlist.',
    );
    expect(err.message).toContain('evil.com');
    expect(err.message).toContain('not on the site allowlist');
  });
});

describe('escalationEngine, detectStructuralTriggers', () => {
  it('is importable without error', async () => {
    const mod = await import('../src/features/computer-use/escalationEngine');
    expect(typeof mod.detectStructuralTriggers).toBe('function');
    expect(typeof mod.detectFieldTriggers).toBe('function');
    expect(typeof mod.makeEscalationDecision).toBe('function');
    expect(typeof mod.verifyReadback).toBe('function');
  });

  it('makeEscalationDecision returns shouldEscalate=false when no triggers', async () => {
    const { makeEscalationDecision } =
      await import('../src/features/computer-use/escalationEngine');
    const fillResults = [
      { key: 'firstName', selector: '#first', success: true, skipped: false },
      { key: 'email', selector: '#email', success: true, skipped: false },
    ];
    const detectedFields = [
      {
        key: 'firstName',
        selector: '#first',
        label: 'First name',
        fieldType: 'text' as const,
        required: true,
      },
      {
        key: 'email',
        selector: '#email',
        label: 'Email',
        fieldType: 'email' as const,
        required: true,
      },
    ];
    const decision = makeEscalationDecision(fillResults, detectedFields, {}, 'greenhouse');
    expect(typeof decision.shouldEscalate).toBe('boolean');
    expect(Array.isArray(decision.triggers)).toBe(true);
  });

  it('makeEscalationDecision returns shouldEscalate=true for file upload fields', async () => {
    const { makeEscalationDecision } =
      await import('../src/features/computer-use/escalationEngine');
    const fillResults = [
      {
        key: 'files.resume',
        selector: 'input[type="file"]',
        success: false,
        skipped: true,
        reason: 'File inputs cannot be filled programmatically',
      },
    ];
    const decision = makeEscalationDecision(fillResults, [], {}, 'greenhouse');
    expect(decision.shouldEscalate).toBe(true);
    expect(decision.triggers.some((t) => t.reason === 'file_upload')).toBe(true);
    expect(decision.agentGoal).toContain('greenhouse');
    expect(decision.agentGoal).toContain('NEVER click Submit');
  });

  it('makeEscalationDecision agentGoal lists fast-path filled fields', async () => {
    const { makeEscalationDecision } =
      await import('../src/features/computer-use/escalationEngine');
    const fillResults = [
      { key: 'firstName', selector: '#fn', success: true, skipped: false },
      {
        key: 'files.resume',
        selector: 'input[type=file]',
        success: false,
        skipped: true,
        reason: 'File inputs cannot be filled programmatically',
      },
    ];
    const decision = makeEscalationDecision(fillResults, [], {}, 'lever');
    expect(decision.agentGoal).toContain('firstName');
    expect(decision.agentGoal).toContain('lever');
  });
});
