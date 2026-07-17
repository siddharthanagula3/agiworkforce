import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { canUseFreeCloudChat, resolveCloudChatSurface } from './free-chat-surface-policy';

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', { headers });
}

describe('free cloud chat surface policy', () => {
  it.each(['web', 'mobile', 'desktop'] as const)('allows the %s chat surface', (surface) => {
    expect(canUseFreeCloudChat(surface)).toBe(true);
    expect(resolveCloudChatSurface(request({ 'x-agi-surface': surface }))).toBe(surface);
  });

  it.each(['chrome', 'vscode', 'api', 'unknown'] as const)(
    'keeps %s outside the free chat plan',
    (surface) => expect(canUseFreeCloudChat(surface)).toBe(false),
  );

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
