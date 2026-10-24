import { randomBytes } from 'node:crypto';
import { DESKTOP_SIGN_IN_PATH } from '@agiworkforce/local-runtime-contract';
import { PRODUCT_BRAND, PRODUCT_NAMES } from '@agiworkforce/types';
import { pagePalette, titleStripHeight } from './windowChrome';

/**
 * The screen a signed-out window shows instead of the site's sign-in pages.
 *
 * Signing in happens in the user's browser, the way it does for the leading
 * desktop apps: the window never holds a password field or a provider's page.
 * The screen is a `data:` page with no bridge, so its buttons speak to the
 * shell the only way such a page can, by navigating. Each button aims at the
 * browser sign-in path with an action and a one-time token in the fragment;
 * the shell's navigation policy hands that to `requestSignIn`, which acts only
 * when the token is the one this window's screen was drawn with.
 */

export type SignInScreenState = 'idle' | 'waiting' | 'expired' | 'unopened';

export type SignInScreenAction = 'start' | 'cancel';

export type SignInScreenEvent =
  'show' | 'start' | 'open-failed' | 'cancel' | 'link-expired' | 'link-complete';

export interface SignInScreenView {
  readonly title: string;
  readonly line: string;
  readonly actions: readonly { label: string; action: SignInScreenAction }[];
}

const ACTION_FIELD = 'agi-sign-in';
const ACTIONS: readonly SignInScreenAction[] = ['start', 'cancel'];

export function nextSignInScreen(
  state: SignInScreenState,
  event: SignInScreenEvent,
  pending: boolean,
): SignInScreenState {
  switch (event) {
    case 'show':
      if (pending) return 'waiting';
      return state === 'waiting' ? 'idle' : state;
    case 'start':
      return 'waiting';
    case 'open-failed':
      return state === 'waiting' ? 'unopened' : state;
    case 'cancel':
    case 'link-complete':
      return 'idle';
    case 'link-expired':
      return 'expired';
  }
}

export function signInScreenView(state: SignInScreenState): SignInScreenView {
  const title = PRODUCT_NAMES.desktop;
  switch (state) {
    case 'idle':
      return {
        title,
        line: `Sign in to ${PRODUCT_BRAND}`,
        actions: [{ label: 'Continue in browser', action: 'start' }],
      };
    case 'waiting':
      return {
        title,
        line: 'Finish signing in in your browser',
        actions: [
          { label: 'Open browser again', action: 'start' },
          { label: 'Cancel', action: 'cancel' },
        ],
      };
    case 'expired':
      return {
        title,
        line: 'Sign-in link expired.',
        actions: [{ label: 'Try again', action: 'start' }],
      };
    case 'unopened':
      return {
        title,
        line: "Your browser didn't open.",
        actions: [{ label: 'Try again', action: 'start' }],
      };
  }
}

export function signInScreenActionUrl(
  action: SignInScreenAction,
  token: string,
  appOrigin: string,
): string {
  const url = new URL(DESKTOP_SIGN_IN_PATH, appOrigin);
  url.hash = new URLSearchParams({ [ACTION_FIELD]: `${action}.${token}` }).toString();
  return url.toString();
}

export function readSignInScreenAction(
  url: string,
  appOrigin: string,
): { action: SignInScreenAction; token: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== new URL(appOrigin).origin) return null;
  if (parsed.pathname !== DESKTOP_SIGN_IN_PATH) return null;
  const value = new URLSearchParams(parsed.hash.slice(1)).get(ACTION_FIELD) ?? '';
  const [action, token] = value.split('.');
  if (!token || !ACTIONS.includes(action as SignInScreenAction)) return null;
  return { action: action as SignInScreenAction, token };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paletteRules(prefersDark: boolean): string {
  const palette = pagePalette(prefersDark);
  return `--ground:${palette.background};--ink:${palette.ink};--ink-2:${palette.secondaryInk}`;
}

export function signInScreenUrl(
  state: SignInScreenState,
  token: string,
  appOrigin: string,
): string {
  const view = signInScreenView(state);
  const buttons = view.actions
    .map(({ label, action }, index) => {
      const href = escapeHtml(signInScreenActionUrl(action, token, appOrigin));
      const kind = index === 0 ? 'primary' : 'secondary';
      return `<button type="button" class="${kind}" data-href="${href}">${escapeHtml(label)}</button>`;
    })
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="color-scheme" content="light dark"><title>${escapeHtml(view.title)}</title><style>
  :root{${paletteRules(false)}}
  @media (prefers-color-scheme: dark){:root{${paletteRules(true)}}}
  html,body{height:100%;margin:0}
  body{background:var(--ground);color:var(--ink);display:flex;align-items:center;justify-content:center;
    font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
  .strip{position:fixed;inset:0 0 auto 0;height:${titleStripHeight()}px;-webkit-app-region:drag}
  main{display:flex;flex-direction:column;align-items:center;gap:24px;padding:0 16px;text-align:center}
  h1{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.01em}
  .actions{display:flex;flex-direction:column;align-items:center;gap:8px}
  button{-webkit-app-region:no-drag;min-height:44px;min-width:200px;padding:0 20px;border-radius:9999px;
    font:inherit;font-weight:500;cursor:pointer}
  .primary{background:var(--ink);color:var(--ground);border:0}
  .primary:hover{opacity:.88}
  .secondary{background:transparent;color:var(--ink-2);border:0}
  .secondary:hover{color:var(--ink)}
  button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
</style></head><body><div class="strip"></div><main>
  <div role="status" aria-live="polite"><h1>${escapeHtml(view.line)}</h1></div>
  <div class="actions">${buttons}</div>
</main><script>
  document.querySelectorAll('button[data-href]').forEach(function(button){
    button.addEventListener('click',function(){location.href=button.dataset.href;});
  });
</script></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export interface SignInScreenWindow {
  readonly id: number;
  isDestroyed(): boolean;
  loadURL(url: string): Promise<void>;
}

export interface SignInScreenDeps {
  readonly appOrigin: string;
  startBrowserSignIn(): Promise<unknown>;
  cancelBrowserSignIn(): void;
  browserSignInPending(): boolean;
  newToken?(): string;
}

export interface SignInScreens {
  /** The window was about to show a sign-in page, or one of the screen's buttons was pressed. */
  request(win: SignInScreenWindow, url: string): void;
  /** Draws the screen in a window that should not show the signed-out product. */
  show(win: SignInScreenWindow): void;
  isShowing(win: SignInScreenWindow): boolean;
  /**
   * A sign-in link arrived for an attempt this run no longer holds. Shown on
   * every window on the screen, or held for the next screen when asked to.
   * False when nothing will show it, so the caller can tell the page instead.
   */
  linkExpired(holdForNextScreen: boolean): boolean;
  /** The browser handed back a sign-in that the window is about to finish. */
  linkCompleted(): void;
  /** A signed-in account settled: a notice held for the next screen is dropped. */
  reset(): void;
  /** The window left the screen or closed. */
  forget(win: SignInScreenWindow): void;
  state(): SignInScreenState;
}

export function createSignInScreens(deps: SignInScreenDeps): SignInScreens {
  const newToken = deps.newToken ?? (() => randomBytes(16).toString('hex'));
  const showing = new Map<number, { win: SignInScreenWindow; token: string }>();
  let state: SignInScreenState = 'idle';

  const draw = (win: SignInScreenWindow): void => {
    if (win.isDestroyed()) {
      showing.delete(win.id);
      return;
    }
    const token = newToken();
    showing.set(win.id, { win, token });
    void win.loadURL(signInScreenUrl(state, token, deps.appOrigin)).catch(() => undefined);
  };

  const redrawAll = (): void => {
    for (const { win } of [...showing.values()]) draw(win);
  };

  const move = (event: SignInScreenEvent): void => {
    state = nextSignInScreen(state, event, deps.browserSignInPending());
  };

  const start = (): void => {
    move('start');
    redrawAll();
    deps.startBrowserSignIn().catch(() => {
      const before = state;
      move('open-failed');
      if (state !== before) redrawAll();
    });
  };

  const show = (win: SignInScreenWindow): void => {
    move('show');
    draw(win);
  };

  return {
    request(win, url) {
      const pressed = readSignInScreenAction(url, deps.appOrigin);
      const current = showing.get(win.id);
      if (pressed && current && pressed.token === current.token) {
        if (pressed.action === 'start') start();
        else {
          deps.cancelBrowserSignIn();
          move('cancel');
          redrawAll();
        }
        return;
      }
      show(win);
    },
    show,
    isShowing(win) {
      return showing.has(win.id) && !win.isDestroyed();
    },
    linkExpired(holdForNextScreen) {
      if (showing.size === 0 && !holdForNextScreen) return false;
      move('link-expired');
      redrawAll();
      return true;
    },
    linkCompleted() {
      move('link-complete');
      showing.clear();
    },
    reset() {
      if (state !== 'waiting') state = 'idle';
    },
    forget(win) {
      showing.delete(win.id);
    },
    state() {
      return state;
    },
  };
}
