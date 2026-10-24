/**
 * Closing the main window on macOS hides it, as native apps do, so the dock
 * icon brings back the same window and its page instead of loading the site
 * again. Anything that is quitting the app must still close it, and the app
 * says so through `quitting`.
 */

export interface HideDecision {
  readonly platform: NodeJS.Platform;
  readonly quitting: boolean;
}

export function shouldHideOnClose({ platform, quitting }: HideDecision): boolean {
  return platform === 'darwin' && !quitting;
}

export interface HideableWindow {
  isFullScreen(): boolean;
  setFullScreen(flag: boolean): void;
  once(event: 'leave-full-screen', listener: () => void): unknown;
  hide(): void;
}

/** A full-screen window is taken out of its space first, or the space is left empty. */
export function hideWindow(win: HideableWindow): void {
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => win.hide());
    win.setFullScreen(false);
    return;
  }
  win.hide();
}
