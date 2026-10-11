import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  getSandboxOrigin,
  isSandboxConfigured,
  isFromSandbox,
  buildSandboxIframeUrl,
  postPickerModeToSandbox,
  postRenderToSandbox,
  parsePickerSelection,
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

  it('rejects the app’s own origin so the frame cannot be same-origin', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = window.location.origin;
    expect(getSandboxOrigin()).toBeNull();
  });

  it('rejects the app’s own origin written with a trailing slash', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = `${window.location.origin}/`;
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

describe('parsePickerSelection', () => {
  const valid = {
    selector: 'main > p',
    text: 'Hello',
    html: '<p>Hello</p>',
    rect: { x: 1, y: 2, width: 30, height: 4 },
  };

  it('accepts a well formed selection', () => {
    expect(parsePickerSelection(valid)).toEqual(valid);
  });

  it('refuses anything that is not an object or lacks a field', () => {
    expect(parsePickerSelection(null)).toBeNull();
    expect(parsePickerSelection('main > p')).toBeNull();
    expect(parsePickerSelection({ ...valid, selector: '' })).toBeNull();
    expect(parsePickerSelection({ ...valid, text: 5 })).toBeNull();
    expect(parsePickerSelection({ ...valid, html: undefined })).toBeNull();
    expect(parsePickerSelection({ ...valid, rect: null })).toBeNull();
  });

  it('refuses oversized strings and non finite or out of range boxes', () => {
    expect(parsePickerSelection({ ...valid, selector: 'a'.repeat(501) })).toBeNull();
    expect(parsePickerSelection({ ...valid, text: 'a'.repeat(501) })).toBeNull();
    expect(parsePickerSelection({ ...valid, html: 'a'.repeat(2_001) })).toBeNull();
    expect(parsePickerSelection({ ...valid, rect: { ...valid.rect, x: Number.NaN } })).toBeNull();
    expect(parsePickerSelection({ ...valid, rect: { ...valid.rect, y: 1e9 } })).toBeNull();
    expect(parsePickerSelection({ ...valid, rect: { ...valid.rect, width: -1 } })).toBeNull();
  });

  it('drops fields it does not know instead of passing them on', () => {
    const parsed = parsePickerSelection({ ...valid, onclick: 'alert(1)' });

    expect(parsed).toEqual(valid);
    expect(parsed).not.toHaveProperty('onclick');
  });
});

describe('postPickerModeToSandbox', () => {
  const original = process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];

  afterEach(() => {
    if (original === undefined) delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    else process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = original;
  });

  it('posts only to the configured sandbox origin', () => {
    process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'] = 'https://sandbox.agiworkforce.com';
    const postMessage = vi.fn();
    const iframe = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;

    postPickerModeToSandbox(iframe, true);

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'picker', active: true },
      'https://sandbox.agiworkforce.com',
    );
  });

  it('posts nothing when no sandbox is configured', () => {
    delete process.env['NEXT_PUBLIC_SANDBOX_ORIGIN'];
    const postMessage = vi.fn();
    const iframe = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;

    postPickerModeToSandbox(iframe, true);

    expect(postMessage).not.toHaveBeenCalled();
  });
});
