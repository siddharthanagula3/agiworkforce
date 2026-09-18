import { selectBrowser, type BrowserSelection, type BrowserSessionKind } from '@agiworkforce/types';

export const VIEWER_HOSTS_THE_BUILT_IN_SESSION =
  'Your Chrome is driven by the AGI extension inside Chrome itself, so this viewer cannot start it. ' +
  'Pick the built-in browser to run here.';

/**
 * The desktop drives its own webview and, through the extension, the person's
 * Chrome. The cloud session has no backend, so it is never present here.
 */
export const DESKTOP_BROWSER_PRESENCE: readonly BrowserSessionKind[] = ['built-in', 'user-chrome'];

export interface DesktopBrowserRequest {
  readonly requested?: BrowserSessionKind | null;
  readonly allowed?: readonly BrowserSessionKind[];
}

export function selectDesktopBrowser(request: DesktopBrowserRequest = {}): BrowserSelection {
  return selectBrowser({
    requested: request.requested ?? null,
    ...(request.allowed ? { allowed: request.allowed } : {}),
    present: DESKTOP_BROWSER_PRESENCE,
  });
}

export interface ViewerStartDecision {
  readonly canStartHere: boolean;
  readonly kind: BrowserSessionKind | null;
  /** Shown to the person whenever the viewer will not start what they picked. */
  readonly message: string | null;
  readonly selection: BrowserSelection;
}

/**
 * What the embedded viewer does with a session choice. Only the built-in
 * session runs inside this window; everything else is refused in words rather
 * than started somewhere the person is not watching.
 */
export function decideViewerStart(request: DesktopBrowserRequest = {}): ViewerStartDecision {
  const selection = selectDesktopBrowser(request);
  if (!selection.ok) {
    return { canStartHere: false, kind: null, message: selection.reason, selection };
  }
  if (selection.kind !== 'built-in') {
    return {
      canStartHere: false,
      kind: selection.kind,
      message: VIEWER_HOSTS_THE_BUILT_IN_SESSION,
      selection,
    };
  }
  return {
    canStartHere: true,
    kind: 'built-in',
    message: selection.viaFallback ? selection.reason : null,
    selection,
  };
}
