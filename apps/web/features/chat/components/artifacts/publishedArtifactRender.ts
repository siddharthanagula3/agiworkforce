import type { ArtifactRenderPayload } from '@/lib/artifact-sandbox';
import {
  buildArtifactCspMeta,
  buildSandboxSrcDoc,
  escapeForInlineScript,
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
      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${buildArtifactCspMeta()}
    <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/@babel/standalone@8.0.4/babel.min.js" integrity="sha384-bdF7m0Y1IFKt9Q6xC8X9qkXn0OBriQWKyWwZKYsN05zF6P/g9OakjjL0G2Sd4pB4" crossorigin="anonymous"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel" data-presets="env,react">
${escapeForInlineScript(content)}
;var __AgiApp = (typeof App !== 'undefined' && App) || (typeof Component !== 'undefined' && Component);
if (__AgiApp) {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(__AgiApp));
}
    </script>
  </body>
</html>`;

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
