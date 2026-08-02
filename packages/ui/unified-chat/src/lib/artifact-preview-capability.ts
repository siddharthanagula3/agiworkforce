/**
 * artifact-preview-capability — can a same-document artifact preview run scripts?
 *
 * DES-C15. Artifact previews render as `<iframe srcDoc=…>` (`ArtifactPanel`'s
 * HTML preview, `ReactPreview`). An `about:srcdoc` document INHERITS the
 * embedder's Content-Security-Policy, and the artifact's own permissive `<meta>`
 * policy (`artifact-sandbox.ts`) can only intersect with that inherited policy,
 * never widen it.
 *
 * Inside the packaged Tauri app the embedder policy is
 * `script-src 'self' 'wasm-unsafe-eval'` (`apps/desktop/src-tauri/tauri.conf.json`):
 * no `'unsafe-inline'`, no `'unsafe-eval'`, no CDN hosts. So an interactive HTML
 * artifact's inline `<script>` never runs, and `ReactPreview`'s CDN Babel/React
 * never loads — the frame stays blank and the toolbar spins "Loading..." forever
 * with nothing telling the user why. That is the "preview shows nothing" report,
 * and it affects Local as much as Cloud.
 *
 * Web does not have the problem because it renders artifacts on a SEPARATE
 * ORIGIN (`NEXT_PUBLIC_SANDBOX_ORIGIN` + `infrastructure/sandbox/index.html`,
 * driven by `apps/web/features/chat/components/SandboxedIframe.tsx`), and a
 * cross-origin document does not inherit the parent policy.
 *
 * The real fix on desktop is a dedicated artifact origin (a Tauri
 * `register_uri_scheme_protocol` serving that same renderer). Until that lands,
 * this module makes the failure HONEST instead of silent: it measures the actual
 * capability at runtime rather than guessing from user agent or config, so the
 * UI can say "scripts can't run here" exactly when that is true, and say nothing
 * when it isn't (web, dev server, any future artifact origin).
 *
 * The measurement is a real capability probe, not a heuristic: a hidden iframe
 * whose srcdoc contains ONE inline script — ours, never model content — that
 * sets a flag. If the inherited policy blocks inline scripts, the flag is
 * missing. Same mechanism, same document, same policy as a real preview.
 *
 * @module artifact-preview-capability
 */

/** Whether a same-document (`srcdoc`) artifact preview may execute scripts. */
export type ArtifactPreviewScriptSupport = 'unknown' | 'allowed' | 'blocked';

/** Global the probe document sets. Namespaced so it cannot collide. */
const PROBE_FLAG = '__agiArtifactInlineScriptProbe';

/**
 * Marker attribute on the probe document's root element.
 *
 * An iframe can fire `load` for a document that is NOT the one we asked for —
 * classically the initial `about:blank`. Concluding from that load would report
 * `'blocked'` on every platform, because about:blank obviously never ran our
 * script. The marker is set by the PARSER, not by script, so it is present
 * whether or not the inline script executed: seeing it proves the load we are
 * reading is the probe document, and only then is the flag meaningful.
 */
const PROBE_MARKER_ATTR = 'data-agi-artifact-probe';

/**
 * Probe document. Deliberately minimal and entirely author-controlled — it is
 * the only srcdoc in this package that runs with `allow-same-origin`, which is
 * required to read the result back and is safe ONLY because no model-generated
 * byte ever reaches it.
 */
const PROBE_SRCDOC = `<!DOCTYPE html><html ${PROBE_MARKER_ATTR}="1"><head><script>window.${PROBE_FLAG}=true;</script></head><body></body></html>`;

/** Give up rather than block the preview forever on a frame that never loads. */
const PROBE_TIMEOUT_MS = 2_000;

/**
 * Run the probe once against `doc`. Resolves `'unknown'` (never rejects) when
 * the environment cannot answer — a non-DOM runtime, a load that never fires,
 * or a same-origin read the engine refuses. `'unknown'` is treated by callers
 * as "say nothing", so an inconclusive probe can never invent a warning.
 */
export function probeSameDocumentScriptSupport(
  doc: Document,
): Promise<ArtifactPreviewScriptSupport> {
  return new Promise<ArtifactPreviewScriptSupport>((resolve) => {
    let settled = false;
    let frame: HTMLIFrameElement | null = null;

    const finish = (result: ArtifactPreviewScriptSupport) => {
      if (settled) return;
      settled = true;
      if (frame?.parentNode) frame.parentNode.removeChild(frame);
      resolve(result);
    };

    try {
      if (!doc.body) {
        resolve('unknown');
        return;
      }
      frame = doc.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      // allow-same-origin is what makes the result readable. See PROBE_SRCDOC.
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.style.position = 'absolute';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';

      frame.addEventListener('load', () => {
        try {
          const contentWindow = frame?.contentWindow as (Window & Record<string, unknown>) | null;
          const root = contentWindow?.document?.documentElement;
          // Not the probe document (initial about:blank, or an engine that does
          // not implement srcdoc). Ignore this load and let the timeout answer
          // `'unknown'` — reading a flag off the wrong document would report a
          // restriction that does not exist.
          if (!root?.hasAttribute(PROBE_MARKER_ATTR)) return;
          finish(contentWindow?.[PROBE_FLAG] === true ? 'allowed' : 'blocked');
        } catch {
          // A cross-origin read means the engine refused allow-same-origin for
          // this frame; we learned nothing about script execution.
          finish('unknown');
        }
      });

      // srcdoc MUST be assigned before insertion: an iframe inserted first
      // navigates to about:blank and fires a load for it, which the marker
      // check above would (correctly) discard — costing the probe its whole
      // timeout window for nothing.
      frame.srcdoc = PROBE_SRCDOC;
      doc.body.appendChild(frame);
      setTimeout(() => finish('unknown'), PROBE_TIMEOUT_MS);
    } catch {
      finish('unknown');
    }
  });
}

let cachedProbe: Promise<ArtifactPreviewScriptSupport> | null = null;

/**
 * Cached, process-wide probe. The embedder's CSP cannot change without a
 * reload, so one measurement per document is enough and every preview shares it.
 */
export function getSameDocumentScriptSupport(): Promise<ArtifactPreviewScriptSupport> {
  if (typeof document === 'undefined') return Promise.resolve('unknown');
  cachedProbe ??= probeSameDocumentScriptSupport(document);
  return cachedProbe;
}

/** Test seam — drops the cached measurement. */
export function __resetSameDocumentScriptSupportCache(): void {
  cachedProbe = null;
}

/**
 * Copy shown when a preview's scripts cannot run. Shared so the HTML and React
 * previews cannot drift into two different explanations of the same cause.
 */
export const SCRIPTS_BLOCKED_NOTICE =
  'Scripts are blocked in this preview by the app’s security policy, so interactive artifacts render without behaviour.';
