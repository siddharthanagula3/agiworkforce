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

  it('routes artifacts to the in-shell gallery, not the public marketing gallery', () => {
    // Regression: this used to point at /gallery, the public marketing-chrome
    // route. Reachable via the collapsed sidebar rail on /chat/code, it took
    // a signed-in user outside the app shell entirely.
    expect(resolveWebViewRoute('artifacts')).toBe('/chat/artifacts');
    expect(resolveWebViewRoute('work-artifacts')).toBe('/chat/artifacts');
  });

  it('routes the collapsed-rail Settings icon to general settings, not voice', () => {
    expect(resolveWebViewRoute('general-settings')).toBe('/settings/general');
  });
});
