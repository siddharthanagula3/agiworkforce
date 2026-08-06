/**
 * artifact-sandbox-origin.spec.ts — DES-C15, the half only the real binary can prove.
 *
 * THE FINDING. Artifact previews used to be `<iframe srcDoc=…>`. An
 * `about:srcdoc` document INHERITS the embedder's Content-Security-Policy, and
 * the packaged app ships `script-src 'self' 'wasm-unsafe-eval'`
 * (`apps/desktop/src-tauri/tauri.conf.json`). The artifact's own permissive
 * `<meta>` policy can only intersect with the inherited one, never widen it — so
 * an interactive HTML artifact rendered its markup and then DID NOTHING, on
 * Local as much as on Cloud. That is the "preview shows nothing" report.
 *
 * THE FIX. `apps/desktop/src-tauri/src/ui/artifact_sandbox.rs` registers a
 * dedicated URI scheme that serves `infrastructure/sandbox/index.html` — the
 * same renderer web deploys — out of the binary. Tauri maps the scheme to
 * `artifact://localhost` on macOS/Linux and `http://artifact.localhost` on
 * Windows. `frame-src` in `tauri.conf.json` permits it; nothing about the app's
 * own `script-src` was relaxed. The preview document is then cross-origin, so it
 * carries its OWN policy and interactive artifacts run.
 *
 * WHY WDIO. Vitest cannot see any of this. jsdom has no CSP engine, does not
 * navigate iframes, and knows nothing about Tauri's custom protocols. Only the
 * packaged binary can answer whether the scheme is registered, whether the app's
 * CSP lets us frame it, and whether an artifact's own script actually mutates
 * the DOM inside the preview.
 *
 * WHAT THIS ASSERTS, end to end:
 *   1. the shipped app resolves the artifact origin exactly the way
 *      `getArtifactSandboxOrigin()` does — via Tauri's own
 *      `__TAURI_INTERNALS__.convertFileSrc(path, 'artifact')` mapping,
 *   2. `frame-src` lets the app embed it and the protocol serves the renderer,
 *      proven by the renderer's `sandbox-ready` handshake arriving,
 *   3. the app posts the production `render` payload and the renderer answers
 *      `render-complete`,
 *   4. and INSIDE that preview, the artifact's own inline `<script>` ran: the
 *      element it targets reads `script-ran-in-preview` instead of the
 *      `not-yet-run` the markup shipped with,
 *   5. while the sandbox's `connect-src 'none'` still blocks egress.
 *
 * DO NOT "fix" a failure here by relaxing a CSP or adding `allow-same-origin` to
 * a same-document preview. A preview that cannot run scripts is a finding to
 * report, not a test to bend.
 *
 * Uses only synchronous `browser.execute` + polling, never `executeAsync` —
 * `wdio/specs/mcp-dotfile-config.spec.ts` records that async-script protocol
 * support varies across the backends this harness runs on.
 *
 * NOTE: authored alongside the fix, NOT yet executed — the WDIO harness build is
 * being repaired separately.
 */

import { waitForDesktopShell } from '../support/desktop-shell';

/** Mirrors `ARTIFACT_SANDBOX_SCHEME` in the Rust module and in unified-chat. */
const ARTIFACT_SCHEME = 'artifact';

/**
 * The artifact under test. Its markup says `not-yet-run`; only executing its own
 * inline script can change that. Deliberately the same shape as the HTML
 * artifact `wdio/specs/cloud-artifacts.spec.ts` stages, so the two specs assert
 * the same product behaviour from different entry points.
 */
const INTERACTIVE_ARTIFACT_HTML =
  '<!DOCTYPE html><html><head><title>Live counter</title></head><body>' +
  '<p id="target">not-yet-run</p>' +
  '<script>' +
  'document.getElementById("target").textContent = "script-ran-in-preview";' +
  // The embedded WebDriver evaluates in the app document and cannot reach
  // into the cross-origin preview (its element/execute calls throw), so the
  // artifact reports its own outcomes to the parent probe instead: DOM
  // mutation proof plus the connect-src egress probe result.
  'parent.postMessage({type:"artifact-script-probe",targetText:document.getElementById("target").textContent},"*");' +
  'fetch("https://example.com/agi-artifact-egress-probe",{mode:"no-cors"}).then(' +
  'function(){parent.postMessage({type:"artifact-egress-probe",egress:"allowed"},"*")},' +
  'function(){parent.postMessage({type:"artifact-egress-probe",egress:"blocked"},"*")});' +
  '</script>' +
  '</body></html>';

/** Id given to the frame we mount, so `switchToFrame` can find it again. */
const FRAME_ID = 'wdio-artifact-sandbox-frame';
/** Window key the in-page probe writes its progress to. */
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

/** Read the in-page probe's current state. */
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

    // Exactly the derivation `getArtifactSandboxOrigin()` performs in
    // packages/ui/unified-chat/src/lib/artifact-sandbox.ts.
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
        // The same attributes ArtifactSandboxFrame mounts the cross-origin frame
        // with. Keeping the renderer's origin is what lets the parent
        // authenticate its messages; the documents stay cross-origin regardless.
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.style.position = 'fixed';
        frame.style.left = '0';
        frame.style.bottom = '0';
        frame.style.width = '320px';
        frame.style.height = '200px';
        frame.style.zIndex = '2147483647';

        window.addEventListener('message', (event: MessageEvent) => {
          // The same authentication ArtifactSandboxFrame performs: window
          // identity first, then origin.
          if (event.source !== frame.contentWindow) return;
          if (event.origin !== origin && event.origin !== 'null') return;
          const data = event.data as { type?: string; error?: string } | undefined;
          if (!data || typeof data !== 'object') return;

          if (data.type === 'sandbox-ready') {
            state.ready = true;
            // The production payload shape: the full document under `html`, plus
            // `runScripts`. The renderer assigns `html` with innerHTML, which
            // never executes <script>; without this flag an interactive artifact
            // would be just as inert here as it was in srcdoc.
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
    // THE assertion this whole cluster exists for. Before the artifact origin,
    // the inherited `script-src 'self' 'wasm-unsafe-eval'` meant this element
    // stayed on `not-yet-run` forever, with nothing on screen explaining why.
    //
    // Proven via the artifact's own postMessage rather than switchToFrame:
    // the embedded WebDriver evaluates in the app document and every
    // element/execute call inside the cross-origin preview throws a
    // JavaScript SecurityError (measured on 2026-08-03; that isolation is
    // itself the sandbox working as designed).
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
    // `connect-src 'none'` in the renderer's policy is what stops a malicious or
    // careless artifact phoning home with whatever it was handed. Running
    // scripts must not have bought that back. The probe fetch runs INSIDE the
    // preview (part of INTERACTIVE_ARTIFACT_HTML's own script) and reports its
    // outcome via postMessage — same cross-origin-driver rationale as above.
    await browser.waitUntil(async () => (await readProbe())?.egress !== null, {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: 'The egress probe inside the artifact sandbox never settled',
    });
    const state = await readProbe();
    expect(state?.egress).toBe('blocked');
  });
});
