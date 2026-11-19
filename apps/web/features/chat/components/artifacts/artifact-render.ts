import { restoreHyphenatedLabels } from '@agiworkforce/unified-chat';
import { buildReactPreviewDocument } from '@agiworkforce/unified-chat/react-preview-document';
import type { ArtifactKind, ArtifactRenderPayload } from '@/lib/artifact-sandbox';
import {
  buildArtifactCspMeta,
  buildSandboxSrcDoc,
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
      return buildSandboxSrcDoc(restoreHyphenatedLabels(content));

    case 'react':
      return buildReactPreviewDocument(content, buildArtifactCspMeta());

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
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js" integrity="sha384-EOXBFmc3gx5mb+vn0vPvvGqACToJD24hhacX5Yx+8NUUQrHIle/Qi5Bg9o3zKwW2" crossorigin="anonymous"></script>
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
