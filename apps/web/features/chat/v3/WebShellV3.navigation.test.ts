import { describe, expect, it } from 'vitest';
import { resolveWebViewRoute } from './WebShellV3';

describe('WebShellV3 managed route navigation', () => {
  it('routes the schedules view to the canonical schedule manager', () => {
    expect(resolveWebViewRoute('schedules')).toBe('/chat/schedules');
  });

  it('routes Code companion surfaces to their real product pages', () => {
    expect(resolveWebViewRoute('code-desktop')).toBe('/download');
    expect(resolveWebViewRoute('code-vscode')).toBe('/vscode-extension');
  });
});
