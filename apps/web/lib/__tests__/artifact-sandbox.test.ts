import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getSandboxOrigin,
  isSandboxConfigured,
  isFromSandbox,
  buildSandboxIframeUrl,
  postRenderToSandbox,
} from '../artifact-sandbox';

describe('getSandboxOrigin', () => {
  const original = process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];

  afterEach(() => {
    if (original === undefined) delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    else process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = original;
  });

  it('returns null when env var is unset', () => {
    delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    expect(getSandboxOrigin()).toBeNull();
  });

  it('returns null when env var is empty', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = '';
    expect(getSandboxOrigin()).toBeNull();
  });

  it('returns null when env var is whitespace', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = '   ';
    expect(getSandboxOrigin()).toBeNull();
  });

  it('normalizes a trailing-slash URL', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com/';
    expect(getSandboxOrigin()).toBe('https://sandbox.agiworkforce.com');
  });

  it('accepts a clean https origin', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com';
    expect(getSandboxOrigin()).toBe('https://sandbox.agiworkforce.com');
  });

  it('accepts http://localhost for dev', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'http://localhost:3001';
    expect(getSandboxOrigin()).toBe('http://localhost:3001');
  });

  it('accepts http://127.0.0.1 for dev', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'http://127.0.0.1:3001';
    expect(getSandboxOrigin()).toBe('http://127.0.0.1:3001');
  });

  it('rejects http:// non-localhost', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'http://evil.com';
    expect(getSandboxOrigin()).toBeNull();
  });

  it('rejects garbage', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'not-a-url';
    expect(getSandboxOrigin()).toBeNull();
  });

  it('rejects javascript: URLs', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'javascript:alert(1)';
    expect(getSandboxOrigin()).toBeNull();
  });
});

describe('isSandboxConfigured', () => {
  beforeEach(() => {
    delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
  });

  it('false when unset', () => {
    expect(isSandboxConfigured()).toBe(false);
  });

  it('true when set to a valid https origin', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com';
    expect(isSandboxConfigured()).toBe(true);
  });
});

describe('isFromSandbox', () => {
  beforeEach(() => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com';
  });

  it('returns true when event.origin matches', () => {
    const event = { origin: 'https://sandbox.agiworkforce.com' } as MessageEvent;
    expect(isFromSandbox(event)).toBe(true);
  });

  it('returns false when event.origin differs', () => {
    const event = { origin: 'https://evil.com' } as MessageEvent;
    expect(isFromSandbox(event)).toBe(false);
  });

  it('returns false when sandbox not configured', () => {
    delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    const event = { origin: 'https://sandbox.agiworkforce.com' } as MessageEvent;
    expect(isFromSandbox(event)).toBe(false);
  });
});

describe('buildSandboxIframeUrl', () => {
  it('returns the iframe URL when sandbox is configured', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com';
    expect(buildSandboxIframeUrl()).toBe('https://sandbox.agiworkforce.com/');
  });

  it('returns null when sandbox is not configured', () => {
    delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    expect(buildSandboxIframeUrl()).toBeNull();
  });
});

describe('postRenderToSandbox', () => {
  beforeEach(() => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com';
  });

  it('throws when sandbox is not configured', () => {
    delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    const iframe = document.createElement('iframe');
    expect(() =>
      postRenderToSandbox(iframe, { type: 'render', kind: 'html', html: 'x' }),
    ).toThrow();
  });

  it('does not throw when iframe contentWindow is null (gracefully skipped)', () => {
    const iframe = document.createElement('iframe');
    expect(() =>
      postRenderToSandbox(iframe, { type: 'render', kind: 'html', html: 'x' }),
    ).not.toThrow();
  });
});
