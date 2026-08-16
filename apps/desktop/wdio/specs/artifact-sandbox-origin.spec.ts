
import { waitForDesktopShell } from '../support/desktop-shell';

const ARTIFACT_SCHEME = 'artifact';

const INTERACTIVE_ARTIFACT_HTML =
  '<!DOCTYPE html><html><head><title>Live counter</title></head><body>' +
  '<p id="target">not-yet-run</p>' +
  '<script>' +
  'document.getElementById("target").textContent = "script-ran-in-preview";' +
  'parent.postMessage({type:"artifact-script-probe",targetText:document.getElementById("target").textContent},"*");' +
  'fetch("https://example.com/agi-artifact-egress-probe",{mode:"no-cors"}).then(' +
  'function(){parent.postMessage({type:"artifact-egress-probe",egress:"allowed"},"*")},' +
  'function(){parent.postMessage({type:"artifact-egress-probe",egress:"blocked"},"*")});' +
  '</script>' +
  '</body></html>';

const FRAME_ID = 'wdio-artifact-sandbox-frame';
const PROBE_KEY = '__wdioArtifactSandboxProbe';

const HANDSHAKE_TIMEOUT_MS = 30_000;

interface ProbeState {
  origin: string | null;
  ready: boolean;
  complete: boolean;
  error: string | null;
  scriptTargetText: string | null;
  egress: 'allowed' | 'blocked' | null;
}

async function readProbe(): Promise<ProbeState | null> {
  return browser.execute((key: string) => {
    const value = (window as unknown as Record<string, unknown>)[key];
    return (value as ProbeState | undefined) ?? null;
  }, PROBE_KEY);
}

describe('DES-C15 · artifact previews have their own origin in the packaged app', () => {
  before(async () => {
    await waitForDesktopShell();
  });

  after(async () => {
    await browser.execute(
      (frameId: string, key: string) => {
        document.getElementById(frameId)?.remove();
        delete (window as unknown as Record<string, unknown>)[key];
      },
      FRAME_ID,
      PROBE_KEY,
    );
  });

  it('resolves the artifact origin from the Tauri runtime, not from a guess', async () => {
    const origin = await browser.execute((scheme: string) => {
      const internals = (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] as
        | { convertFileSrc?: (path: string, protocol?: string) => string }
        | undefined;
      if (typeof internals?.convertFileSrc !== 'function') return null;
      const url = new URL(internals.convertFileSrc('', scheme));
      return `${url.protocol}//${url.host}`;
    }, ARTIFACT_SCHEME);

    expect(origin).not.toBeNull();
    expect([`${ARTIFACT_SCHEME}://localhost`, `http://${ARTIFACT_SCHEME}.localhost`]).toContain(
      origin,
    );
  });

  it('serves the shared renderer there, and it completes the render handshake', async () => {
    await browser.execute(
      (scheme: string, frameId: string, key: string, artifactHtml: string) => {
        const w = window as unknown as Record<string, unknown>;
        const state = {
          origin: null as string | null,
          ready: false,
          complete: false,
          error: null as string | null,
          scriptTargetText: null as string | null,
          egress: null as 'allowed' | 'blocked' | null,
        };
        w[key] = state;

        const internals = w['__TAURI_INTERNALS__'] as
          | { convertFileSrc?: (path: string, protocol?: string) => string }
          | undefined;
        if (typeof internals?.convertFileSrc !== 'function') {
          state.error = 'no Tauri runtime in this document';
          return;
        }
        const url = new URL(internals.convertFileSrc('', scheme));
        const origin = `${url.protocol}//${url.host}`;
        state.origin = origin;

        document.getElementById(frameId)?.remove();
        const frame = document.createElement('iframe');
        frame.id = frameId;
        frame.src = `${origin}/`;
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.style.position = 'fixed';
        frame.style.left = '0';
        frame.style.bottom = '0';
        frame.style.width = '320px';
        frame.style.height = '200px';
        frame.style.zIndex = '2147483647';

        window.addEventListener('message', (event: MessageEvent) => {
          if (event.source !== frame.contentWindow) return;
          if (event.origin !== origin && event.origin !== 'null') return;
          const data = event.data as { type?: string; error?: string } | undefined;
          if (!data || typeof data !== 'object') return;

          if (data.type === 'sandbox-ready') {
            state.ready = true;
            frame.contentWindow?.postMessage(
              { type: 'render', kind: 'html', html: artifactHtml, runScripts: true },
              event.origin === 'null' ? '*' : event.origin,
            );
            return;
          }
          if (data.type === 'render-complete') {
            state.complete = true;
            return;
          }
          if (data.type === 'render-error') {
            state.error = data.error ?? 'unknown render error';
            return;
          }
          const probeData = data as { type?: string; targetText?: string; egress?: string };
          if (probeData.type === 'artifact-script-probe') {
            state.scriptTargetText = probeData.targetText ?? null;
            return;
          }
          if (probeData.type === 'artifact-egress-probe') {
            state.egress = probeData.egress === 'allowed' ? 'allowed' : 'blocked';
          }
        });

        document.body.appendChild(frame);
      },
      ARTIFACT_SCHEME,
      FRAME_ID,
      PROBE_KEY,
      INTERACTIVE_ARTIFACT_HTML,
    );

    await browser.waitUntil(
      async () => {
        const state = await readProbe();
        return Boolean(state && (state.complete || state.error));
      },
      {
        timeout: HANDSHAKE_TIMEOUT_MS,
        interval: 250,
        timeoutMsg:
          'The artifact origin never completed a render. Either frame-src blocks it, the ' +
          'artifact:// scheme is not registered, or the renderer never sent sandbox-ready.',
      },
    );

    const state = await readProbe();
    expect(state).not.toBeNull();
    expect(state?.error).toBeNull();
    expect(state?.ready).toBe(true);
    expect(state?.complete).toBe(true);
  });

  it('runs the artifact’s own script inside the preview', async () => {
    await browser.waitUntil(async () => (await readProbe())?.scriptTargetText !== null, {
      timeout: HANDSHAKE_TIMEOUT_MS,
      interval: 250,
      timeoutMsg:
        'The artifact rendered but its own script never reported — the preview document is ' +
        'still inheriting a policy that forbids inline scripts.',
    });
    const state = await readProbe();
    expect(state?.scriptTargetText).toBe('script-ran-in-preview');

    await browser.saveScreenshot('/tmp/agi-desktop-artifact-origin-interactive.png');
  });

  it('keeps the artifact origin egress-blocked', async () => {
    await browser.waitUntil(async () => (await readProbe())?.egress !== null, {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: 'The egress probe inside the artifact sandbox never settled',
    });
    const state = await readProbe();
    expect(state?.egress).toBe('blocked');
  });
});
