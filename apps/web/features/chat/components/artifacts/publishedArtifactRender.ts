import { buildReactPreviewDocument } from '@agiworkforce/unified-chat/react-preview-document';
import type { ArtifactRenderPayload } from '@/lib/artifact-sandbox';
import {
  buildArtifactCspMeta,
  buildSandboxSrcDoc,
  escapeHTML,
  sanitizeSVG,
} from '@shared/utils/html-sanitizer';

export type PublishedArtifactKind =
  'html' | 'react' | 'svg' | 'mermaid' | 'markdown' | 'text' | 'code';

export const PUBLISHED_SANDBOX_KINDS: readonly PublishedArtifactKind[] = [
  'html',
  'react',
  'mermaid',
];

export function isSandboxedPublishedKind(kind: PublishedArtifactKind): boolean {
  return PUBLISHED_SANDBOX_KINDS.includes(kind);
}

export function buildPublishedSandboxPayload(
  kind: PublishedArtifactKind,
  content: string,
): ArtifactRenderPayload {
  switch (kind) {
    case 'html':
      return { type: 'render', kind: 'html', html: buildSandboxSrcDoc(content), runScripts: true };
    case 'react':
      return { type: 'render', kind: 'react', code: content };
    case 'mermaid':
      return { type: 'render', kind: 'mermaid', code: content };
    default:
      return { type: 'render', kind: 'text', text: content };
  }
}

export function buildPublishedFallbackSrcDoc(kind: PublishedArtifactKind, content: string): string {
  switch (kind) {
    case 'html':
      return buildSandboxSrcDoc(content);

    case 'react':
      return buildReactPreviewDocument(content, buildArtifactCspMeta());

    case 'mermaid':
      return `<!DOCTYPE html>
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
      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    ${buildArtifactCspMeta()}
    <style>
      body { margin: 0; padding: 16px; font-family: monospace; white-space: pre-wrap; }
    </style>
  </head>
  <body>${escapeHTML(content)}</body>
</html>`;
  }
}

export function buildPublishedSvgImageSrc(content: string): string | null {
  const sanitized = sanitizeSVG(content).trim();
  if (!sanitized) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized)}`;
}
