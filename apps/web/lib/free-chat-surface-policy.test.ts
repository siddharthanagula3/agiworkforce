import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import {
  canUseManagedCloudChatSurface,
  getCloudChatSurfaceCapability,
  resolveCloudChatSurface,
} from './free-chat-surface-policy';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', { headers });
}

describe('managed cloud chat surface policy', () => {
  it.each(['web', 'mobile', 'desktop'] as const)('admits Free and Basic chat on %s', (surface) => {
    expect(canUseManagedCloudChatSurface('free', surface)).toBe(true);
    expect(canUseManagedCloudChatSurface('basic', surface)).toBe(true);
    expect(getCloudChatSurfaceCapability(surface)).toBe('managed_chat');
    expect(resolveCloudChatSurface(request({ 'x-agi-surface': surface }))).toBe(surface);
  });

  it.each(['chrome', 'vscode', 'cli'] as const)(
    'requires the developer-surface capability on %s',
    (surface) => {
      expect(getCloudChatSurfaceCapability(surface)).toBe('developer_surfaces');
      expect(canUseManagedCloudChatSurface('basic', surface)).toBe(false);
      expect(canUseManagedCloudChatSurface('pro', surface)).toBe(true);
      expect(resolveCloudChatSurface(request({ 'x-agi-surface': surface }))).toBe(surface);
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

  it('recognizes the existing VS Code client header and otherwise fails closed', () => {
    expect(resolveCloudChatSurface(request({ 'x-client': 'vscode-extension' }))).toBe('vscode');
    expect(resolveCloudChatSurface(request())).toBe('unknown');
  });

  it('does not let a browser extension override its stronger client identity', () => {
    expect(
      resolveCloudChatSurface(request({ 'x-client': 'vscode-extension', 'x-agi-surface': 'web' })),
    ).toBe('vscode');
    expect(
      resolveCloudChatSurface(
        request({ origin: 'chrome-extension://abcdefghijklmnop', 'x-agi-surface': 'web' }),
      ),
    ).toBe('chrome');
  });
});
