import type { ArtifactKind, ArtifactRenderPayload } from '@/lib/artifact-sandbox';
import {
  buildArtifactCspMeta,
  buildSandboxSrcDoc,
  escapeForInlineScript,
  escapeHTML,
  sanitizeSVG,
} from '@shared/utils/html-sanitizer';
import type { ArtifactData } from './ArtifactPreview';

export const LIVE_PREVIEW_ARTIFACT_TYPES: ReadonlySet<ArtifactData['type']> = new Set([
  'html',
  'react',
  'svg',
]);

export function canRenderLivePreview(type: ArtifactData['type']): boolean {
  return LIVE_PREVIEW_ARTIFACT_TYPES.has(type);
}

function renderTypeFor(type: ArtifactData['type']): ArtifactData['type'] {
  return type === 'document' ? 'code' : type;
}

/**
 * The same-document srcDoc the sandbox falls back to. The SandboxedIframe
 * frames it with sandbox="allow-scripts allow-modals" and no allow-same-origin,
 * so the null-origin sandbox is the boundary and scripts execute safely. Every
 * branch carries the artifact CSP; text that is not markup is escaped.
 */
export function buildArtifactPreviewDocument(type: ArtifactData['type'], content: string): string {
  switch (renderTypeFor(type)) {
    case 'html':
      return buildSandboxSrcDoc(content);

    case 'react': {
      const reactSource = escapeForInlineScript(content);
      return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${buildArtifactCspMeta()}
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel" data-presets="env,react">
${reactSource}
;var __AgiApp = (typeof App !== 'undefined' && App) || (typeof Component !== 'undefined' && Component);
if (__AgiApp) {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__AgiApp));
}
    </script>
  </body>
</html>`;
    }

    case 'svg': {
      const sanitizedSVG = sanitizeSVG(content);
      return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
      body {
        margin: 0;
        padding: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    ${sanitizedSVG}
  </body>
</html>`;
    }

    case 'mermaid':
      return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    ${buildArtifactCspMeta()}
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ startOnLoad: true, securityLevel: 'strict' });</script>
  </head>
  <body>
    <div class="mermaid">
      ${escapeHTML(content)}
    </div>
  </body>
</html>`;

    default:
      return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    ${buildArtifactCspMeta()}
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: monospace;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>${escapeHTML(content)}</body>
</html>`;
  }
}

/**
 * The message posted to the cross-origin sandbox renderer. DOMPurify has no
 * sanitize() without a DOM, so callers build this only after mount.
 */
export function buildArtifactRenderPayload(
  type: ArtifactData['type'],
  content: string,
): ArtifactRenderPayload {
  const renderType = renderTypeFor(type);
  const kind: ArtifactKind = renderType === 'code' ? 'code' : (renderType as ArtifactKind);
  switch (renderType) {
    case 'html':
      return { type: 'render', kind: 'html', html: buildSandboxSrcDoc(content), runScripts: true };
    case 'react':
      return { type: 'render', kind: 'react', code: content };
    case 'svg':
      return { type: 'render', kind: 'svg', svg: sanitizeSVG(content) };
    case 'mermaid':
      return { type: 'render', kind: 'mermaid', code: content };
    default:
      return { type: 'render', kind, text: content };
  }
}
