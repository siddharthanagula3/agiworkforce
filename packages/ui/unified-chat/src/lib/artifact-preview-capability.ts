/**
 * artifact-preview-capability, can a same-document artifact preview run scripts?
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
 * never loads, the frame stays blank and the toolbar spins "Loading..." forever
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
 * whose srcdoc contains ONE inline script, ours, never model content, that
 * sets a flag. If the inherited policy blocks inline scripts, the flag is
 * missing. Same mechanism, same document, same policy as a real preview.
 *
 * @module artifact-preview-capability
 */

export type ArtifactPreviewScriptSupport = 'unknown' | 'allowed' | 'blocked';

const PROBE_FLAG = '__agiArtifactInlineScriptProbe';

const PROBE_MARKER_ATTR = 'data-agi-artifact-probe';

const PROBE_SRCDOC = `<!DOCTYPE html><html ${PROBE_MARKER_ATTR}="1"><head><script>window.${PROBE_FLAG}=true;</script></head><body></body></html>`;

const PROBE_TIMEOUT_MS = 2_000;

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
          if (!root?.hasAttribute(PROBE_MARKER_ATTR)) return;
          finish(contentWindow?.[PROBE_FLAG] === true ? 'allowed' : 'blocked');
        } catch {
          finish('unknown');
        }
      });

      frame.srcdoc = PROBE_SRCDOC;
      doc.body.appendChild(frame);
      setTimeout(() => finish('unknown'), PROBE_TIMEOUT_MS);
    } catch {
      finish('unknown');
    }
  });
}

let cachedProbe: Promise<ArtifactPreviewScriptSupport> | null = null;

export function getSameDocumentScriptSupport(): Promise<ArtifactPreviewScriptSupport> {
  if (typeof document === 'undefined') return Promise.resolve('unknown');
  cachedProbe ??= probeSameDocumentScriptSupport(document);
  return cachedProbe;
}

export function __resetSameDocumentScriptSupportCache(): void {
  cachedProbe = null;
}

export const SCRIPTS_BLOCKED_NOTICE =
  'Scripts are blocked in this preview by the app’s security policy, so interactive artifacts render without behaviour.';
