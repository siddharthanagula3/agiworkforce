import { describe, expect, it } from 'vitest';
import {
  DESKTOP_BROWSER_PRESENCE,
  VIEWER_HOSTS_THE_BUILT_IN_SESSION,
  decideViewerStart,
  selectDesktopBrowser,
} from '../browserSelection';

describe('desktop browser selection', () => {
  it('picks the built-in session automatically', () => {
    const selection = selectDesktopBrowser();
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('built-in');
    expect(selection.viaFallback).toBe(false);
  });

  it('never offers the cloud session, which has no backend', () => {
    expect(DESKTOP_BROWSER_PRESENCE).not.toContain('cloud');
    const selection = selectDesktopBrowser({ requested: 'cloud' });
    expect(selection.ok).toBe(false);
  });

  it('honours an override to the user Chrome', () => {
    const selection = selectDesktopBrowser({ requested: 'user-chrome' });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('user-chrome');
  });

  it('refuses a session the workspace policy forbids', () => {
    const selection = selectDesktopBrowser({ requested: 'user-chrome', allowed: ['built-in'] });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('built-in');
    expect(selection.viaFallback).toBe(true);
  });
});

describe('what the embedded viewer will start', () => {
  it('starts the built-in session in this window', () => {
    const decision = decideViewerStart({ requested: 'built-in' });
    expect(decision.canStartHere).toBe(true);
    expect(decision.kind).toBe('built-in');
    expect(decision.message).toBeNull();
  });

  it('refuses the user Chrome here and says where to start it', () => {
    const decision = decideViewerStart({ requested: 'user-chrome' });
    expect(decision.canStartHere).toBe(false);
    expect(decision.message).toBe(VIEWER_HOSTS_THE_BUILT_IN_SESSION);
  });

  it('refuses a cloud request rather than falling back into a broader session', () => {
    const decision = decideViewerStart({ requested: 'cloud' });
    expect(decision.canStartHere).toBe(false);
    expect(decision.kind).toBeNull();
    expect(decision.message).toContain('cloud browser');
    if (decision.selection.ok) throw new Error('a cloud request must not resolve');
    expect(decision.selection.declined.find((entry) => entry.kind === 'user-chrome')?.reason).toBe(
      'would-broaden-access',
    );
  });
});
