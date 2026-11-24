import { PRODUCT_BRAND, PRODUCT_NAMES } from '@agiworkforce/types';
import { SHELL_STRIP_HTML, escapeHtml, shellBaseCss, shellDataUrl } from './shellPage';

declare const AGI_SHELL_SYMBOL_URL: string;

function shellSymbol(): string {
  return `<img src="${AGI_SHELL_SYMBOL_URL}" width="40" height="40" alt="">`;
}

/**
 * The pages the shell itself draws when the window has nothing to show. They
 * name what happened in this app's own words: a Chromium error string and a
 * renderer exit code are internals, so only a short support reference survives.
 */

export interface ShellScreen {
  readonly title: string;
  readonly heading: string;
  readonly body: string;
  readonly action: string;
  readonly reference: string;
}

/** Chromium's own number for a connection that never answered; the first-load watchdog reports it. */
export const LOAD_TIMED_OUT_ERROR = -7;

/** The one Chromium net error that states this device has no connection. */
const DEVICE_OFFLINE_ERROR = -106;

/**
 * Errors raised on this device's path to the network (name lookup, routing, a
 * blocked connection). They do not prove the device is offline, so the screen
 * says what could not be done and what to check, not that the reader is offline.
 */
const DEVICE_PATH_ERRORS = new Set([-21, -105, -109, -137, -138]);

export function offlineScreen(errorCode: number): ShellScreen {
  const reference = `net-${Math.abs(errorCode)}`;
  if (errorCode === DEVICE_OFFLINE_ERROR) {
    return {
      title: `${PRODUCT_NAMES.desktop}, offline`,
      heading: "You're offline",
      body: 'This device is not connected to the internet. Reconnect and try again.',
      action: 'Try again',
      reference,
    };
  }
  if (DEVICE_PATH_ERRORS.has(errorCode)) {
    return {
      title: `${PRODUCT_NAMES.desktop}, not connected`,
      heading: `Can't connect to ${PRODUCT_BRAND}`,
      body: 'Check your internet connection and any VPN, proxy or firewall, then try again.',
      action: 'Try again',
      reference,
    };
  }
  return {
    title: `${PRODUCT_NAMES.desktop}, unreachable`,
    heading: `Can't reach ${PRODUCT_BRAND}`,
    body: 'The service did not respond. Try again in a moment.',
    action: 'Try again',
    reference,
  };
}

export function serviceUnavailableScreen(status: number): ShellScreen {
  return {
    title: `${PRODUCT_NAMES.desktop}, page unavailable`,
    heading: 'This page is temporarily unavailable',
    body: 'The app will retry automatically. You can also try again now.',
    action: 'Try again',
    reference: `http-${status}`,
  };
}

export function crashScreen(reference: string): ShellScreen {
  return {
    title: `${PRODUCT_NAMES.desktop}, stopped`,
    heading: 'This window stopped responding',
    body: 'It stopped twice in a row, so it was not reloaded again. Anything you had sent is saved to your account, and a message you were still typing is kept on this device. Attachments you had not sent may need adding again.',
    action: 'Reload',
    reference,
  };
}

export function retryUrlAfterFailedLoad(validatedUrl: string, entryUrl: string): string {
  try {
    const target = new URL(validatedUrl);
    const entry = new URL(entryUrl);
    if (
      target.protocol === entry.protocol &&
      target.host === entry.host &&
      target.username === '' &&
      target.password === ''
    ) {
      return target.href;
    }
  } catch {
    return entryUrl;
  }
  return entryUrl;
}

export function shellScreenUrl(screen: ShellScreen, retryUrl: string): string {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="color-scheme" content="light dark"><title>{{title}}</title><style>
  ${shellBaseCss()}
  main{max-width:28rem;gap:16px}
  p{margin:0;color:var(--ink-2)}
  code{color:var(--ink-2);font:12px/18px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
</style></head><body>${SHELL_STRIP_HTML}<main>
  ${shellSymbol()}
  <h1>{{heading}}</h1>
  <p>{{body}}</p>
  <div class="actions"><button id="retry" type="button" class="primary" data-retry-url="{{retryUrl}}" autofocus>{{action}}</button></div>
  <p><code>Reference: {{reference}}</code></p>
</main><script>
  document.getElementById('retry').addEventListener('click',function(){
    location.href=document.getElementById('retry').dataset.retryUrl;
  });
</script></body></html>`;
  const fields: Record<string, string> = {
    title: screen.title,
    heading: screen.heading,
    body: screen.body,
    action: screen.action,
    reference: screen.reference,
    retryUrl,
  };
  const rendered = html.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, field: string) =>
    escapeHtml(fields[field] ?? ''),
  );
  return shellDataUrl(rendered);
}

export function loadingScreenUrl(): string {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="color-scheme" content="light dark"><title>${escapeHtml(PRODUCT_NAMES.desktop)}</title><style>
  ${shellBaseCss()}
  main{gap:16px}
  .loading-status{display:flex;align-items:center;gap:8px}
  .loading-status h1{font:inherit}
  .spinner{width:16px;height:16px;box-sizing:border-box;border-radius:50%;
    border:2px solid var(--ink-2);border-top-color:var(--ink);animation:spin .9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.spinner{animation:none}}
</style></head><body>${SHELL_STRIP_HTML}<main role="status" aria-live="polite">
  ${shellSymbol()}
  <div class="loading-status">
    <div class="spinner" aria-hidden="true"></div>
    <h1>Opening ${escapeHtml(PRODUCT_NAMES.desktop)}</h1>
  </div>
</main></body></html>`;
  return shellDataUrl(html);
}
