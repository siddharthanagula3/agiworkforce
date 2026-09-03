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
