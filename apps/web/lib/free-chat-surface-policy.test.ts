import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import {
  bindSurfaceFromClaims,
  canUseManagedCloudChatSurface,
  getCloudChatSurfaceCapability,
  resolveCloudChatSurface,
} from './free-chat-surface-policy';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', { headers });
}

describe('managed cloud chat surface policy', () => {
  it.each(['web', 'mobile', 'desktop', 'chrome'] as const)(
    'admits Free and Basic chat on %s',
    (surface) => {
      expect(canUseManagedCloudChatSurface('free', surface)).toBe(true);
      expect(canUseManagedCloudChatSurface('basic', surface)).toBe(true);
      expect(getCloudChatSurfaceCapability(surface)).toBe('managed_chat');
    },
  );

  it.each(['vscode', 'cli'] as const)(
    'requires the developer-surface capability on %s',
    (surface) => {
      expect(getCloudChatSurfaceCapability(surface)).toBe('developer_surfaces');
      expect(canUseManagedCloudChatSurface('basic', surface)).toBe(false);
      expect(canUseManagedCloudChatSurface('pro', surface)).toBe(true);
    },
  );

  it('requires the managed API capability for API clients', () => {
    expect(getCloudChatSurfaceCapability('api')).toBe('managed_api');
    expect(canUseManagedCloudChatSurface('basic', 'api')).toBe(false);
    expect(canUseManagedCloudChatSurface('pro', 'api')).toBe(true);
  });

  it('fails closed for unknown surfaces and unknown or local-only plans', () => {
    expect(getCloudChatSurfaceCapability('unknown')).toBeNull();
    expect(canUseManagedCloudChatSurface('enterprise', 'unknown')).toBe(false);
    expect(canUseManagedCloudChatSurface('not-a-plan', 'web')).toBe(false);
    expect(canUseManagedCloudChatSurface('local-only', 'web')).toBe(false);
    expect(canUseManagedCloudChatSurface('byok', 'web')).toBe(false);
  });
});

/**
 * D-2026-09-15-09: the surface is bound to claims Clerk signed. A token the
 * web app minted carries the web origin as `azp`, the extension's carries its
 * chrome-extension origin, and the mobile app mints from a template that
 * stamps the surface claim. A script that mints tokens with no origin holds
 * none of those, and no header it types can stand in for them.
 */
describe('binding a Clerk token to the surface that minted it', () => {
  it('binds a browser-minted token to the web app by its origin', () => {
    expect(bindSurfaceFromClaims({ azp: 'https://agiworkforce.com' })).toBe('web');
    expect(bindSurfaceFromClaims({ azp: 'http://localhost:3100' })).toBe('web');
  });

  it('binds a token minted inside the browser extension to chrome', () => {
    expect(bindSurfaceFromClaims({ azp: 'chrome-extension://abcdefghijklmnop' })).toBe('chrome');
  });

  it('binds a token from the mobile template by the surface claim Clerk signed', () => {
    expect(bindSurfaceFromClaims({ surface: 'mobile' })).toBe('mobile');
  });

  it('binds nothing for a token with no origin and no template claim', () => {
    expect(bindSurfaceFromClaims({ sub: 'user_1' })).toBeNull();
    expect(bindSurfaceFromClaims({ azp: '' })).toBeNull();
  });

  it('ignores a surface claim that no template is allowed to stamp', () => {
    expect(bindSurfaceFromClaims({ surface: 'cli' })).toBeNull();
    expect(bindSurfaceFromClaims({ surface: 'web' })).toBeNull();
    expect(bindSurfaceFromClaims({ surface: 'api' })).toBeNull();
  });
});

describe('resolving the surface a request runs as', () => {
  it.each(['web', 'mobile', 'desktop', 'chrome', 'cli', 'vscode', 'api'] as const)(
    'ignores a header that claims %s on a token bound to nothing',
    (claimed) => {
      expect(resolveCloudChatSurface(request({ 'x-agi-surface': claimed }))).toBe('unknown');
      expect(resolveCloudChatSurface(request({ 'x-agi-surface': claimed }), undefined, null)).toBe(
        'unknown',
      );
    },
  );

  it('keeps a web-bound token on the web capability no matter what the header claims', () => {
    for (const claimed of ['mobile', 'cli', 'vscode', 'api']) {
      expect(resolveCloudChatSurface(request({ 'x-agi-surface': claimed }), undefined, 'web')).toBe(
        'web',
      );
    }
    expect(resolveCloudChatSurface(request(), undefined, 'web')).toBe('web');
  });

  it.each(['desktop', 'chrome'] as const)(
    'lets %s, which carries a token the web app minted, name itself within the web capability',
    (carrier) => {
      expect(resolveCloudChatSurface(request({ 'x-agi-surface': carrier }), undefined, 'web')).toBe(
        carrier,
      );
      expect(getCloudChatSurfaceCapability(carrier)).toBe(getCloudChatSurfaceCapability('web'));
    },
  );

  it.each(['chrome', 'mobile'] as const)('keeps a %s-bound token on %s', (bound) => {
    for (const claimed of ['web', 'desktop', 'cli', 'vscode', 'api']) {
      expect(resolveCloudChatSurface(request({ 'x-agi-surface': claimed }), undefined, bound)).toBe(
        bound,
      );
    }
    expect(resolveCloudChatSurface(request(), undefined, bound)).toBe(bound);
  });

  it('does not let a forged extension origin header stand in for the signed origin', () => {
    expect(
      resolveCloudChatSurface(request({ origin: 'chrome-extension://abcdefghijklmnop' })),
    ).toBe('unknown');
  });

  describe('credential-proved developer class outranks every header', () => {
    it.each(['desktop', 'web', 'mobile', 'chrome'] as const)(
      'refuses to let a developer token escape into %s',
      (claimed) => {
        const surface = resolveCloudChatSurface(request({ 'x-agi-surface': claimed }), 'developer');

        expect(getCloudChatSurfaceCapability(surface)).toBe('developer_surfaces');
        expect(canUseManagedCloudChatSurface('free', surface)).toBe(false);
        expect(canUseManagedCloudChatSurface('basic', surface)).toBe(false);
        expect(canUseManagedCloudChatSurface('pro', surface)).toBe(true);
      },
    );

    it.each(['cli', 'vscode'] as const)(
      'keeps %s granularity when the header names a surface already in the class',
      (claimed) => {
        expect(resolveCloudChatSurface(request({ 'x-agi-surface': claimed }), 'developer')).toBe(
          claimed,
        );
      },
    );

    it('recognizes the VS Code client header inside the developer class', () => {
      expect(
        resolveCloudChatSurface(request({ 'x-client': 'vscode-extension' }), 'developer'),
      ).toBe('vscode');
    });

    it('defaults to a developer surface when no usable hint is present', () => {
      expect(resolveCloudChatSurface(request(), 'developer')).toBe('cli');
    });
  });
});
