import { pageBackgroundColor } from './windowChrome';

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

/** The one Chromium net error that states this device has no connection. */
const DEVICE_OFFLINE_ERROR = -106;

/**
 * Errors raised on this device's path to the network (name lookup, routing, a
 * blocked connection). They do not prove the device is offline, so the screen
 * says what could not be done and what to check, not that the reader is offline.
 */
const DEVICE_PATH_ERRORS = new Set([-21, -105, -109, -137, -138]);

const ACCOUNT_UNCHANGED = 'Your account data is unchanged';

export function offlineScreen(errorCode: number): ShellScreen {
  const reference = `net-${Math.abs(errorCode)}`;
  if (errorCode === DEVICE_OFFLINE_ERROR) {
    return {
      title: 'AGI Workforce, offline',
      heading: "You're offline",
      body: `This device is not connected to the internet. ${ACCOUNT_UNCHANGED}, reconnect to continue.`,
      action: 'Try again',
      reference,
    };
  }
  if (DEVICE_PATH_ERRORS.has(errorCode)) {
    return {
      title: 'AGI Workforce, not connected',
      heading: "Can't connect to AGI Workforce",
      body: `This device could not reach agiworkforce.com. Check the internet connection and any VPN, proxy or firewall, then try again. ${ACCOUNT_UNCHANGED}.`,
      action: 'Try again',
      reference,
    };
  }
  return {
    title: 'AGI Workforce, unreachable',
    heading: "Can't reach AGI Workforce",
    body: `AGI Workforce did not answer. ${ACCOUNT_UNCHANGED} and nothing is wrong with your account. Try again in a moment.`,
    action: 'Try again',
    reference,
  };
}

export function crashScreen(reference: string): ShellScreen {
  return {
    title: 'AGI Workforce, stopped',
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function shellScreenUrl(
  screen: ShellScreen,
  retryUrl: string,
  prefersDark: boolean,
): string {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="color-scheme" content="${prefersDark ? 'dark' : 'light'}"><title>${escapeHtml(screen.title)}</title><style>
  html,body{height:100%;margin:0}
  body{background:${pageBackgroundColor(prefersDark)};color:${prefersDark ? '#ececec' : '#1f1f1f'};
    display:flex;align-items:center;justify-content:center;
    font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  main{max-width:30rem;padding:2rem;text-align:center}
  h1{font-size:1.25rem;font-weight:600;margin:0 0 .5rem;letter-spacing:-.01em}
  p{color:${prefersDark ? '#b4b4b4' : '#5d5d5d'};margin:0 0 1.5rem}
  code{color:#8a9693;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    word-break:break-all}
  button{background:#da7756;color:#fff;border:0;border-radius:8px;padding:.6rem 1.25rem;
    font:inherit;font-weight:600;cursor:pointer}
  button:hover{opacity:.9}
  button:focus-visible{outline:2px solid ${prefersDark ? '#ececec' : '#1f1f1f'};outline-offset:2px}
</style></head><body><main>
  <h1>${escapeHtml(screen.heading)}</h1>
  <p>${escapeHtml(screen.body)}</p>
  <button id="retry" autofocus>${escapeHtml(screen.action)}</button>
  <p style="margin:1.5rem 0 0"><code>Reference: ${escapeHtml(screen.reference)}</code></p>
</main><script>
  document.getElementById('retry').addEventListener('click',function(){
    location.href=${JSON.stringify(retryUrl)};
  });
</script></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
