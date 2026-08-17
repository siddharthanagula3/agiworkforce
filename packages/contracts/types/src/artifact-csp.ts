/**
 * Canonical Content-Security-Policy for rendered artifacts.
 *
 * Three surfaces enforce this policy and must never drift apart: the dedicated
 * cross-origin renderer (`infrastructure/sandbox/index.html`, whose meta tag is
 * also replayed as a header by the desktop artifact scheme), and the same-page
 * `srcDoc` fallbacks in `apps/web` and `@agiworkforce/unified-chat`. They all
 * derive from this module so the isolation argument's "identical policy" claim
 * stays true by construction.
 *
 * @module artifact-csp
 * @packageDocumentation
 */

export const ARTIFACT_SCRIPT_CDN_HOSTS = [
  'https://unpkg.com',
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://esm.sh',
] as const;

function artifactCspDirectives(ownOrigin: boolean, extraScriptSources: readonly string[]): string {
  const self = ownOrigin ? ["'self'"] : [];
  return [
    "default-src 'none'",
    `script-src ${[
      ...self,
      "'unsafe-inline'",
      "'unsafe-eval'",
      ...ARTIFACT_SCRIPT_CDN_HOSTS,
      ...extraScriptSources,
    ].join(' ')}`,
    `style-src ${[...self, "'unsafe-inline'", 'https:'].join(' ')}`,
    `img-src ${[...self, 'data:', 'blob:', 'https:'].join(' ')}`,
    `font-src ${[...self, 'data:', 'https:'].join(' ')}`,
    'media-src data: blob:',
    "connect-src 'none'",
    // The renderer mounts artifacts in a nested `<iframe srcdoc>`; `about:srcdoc`
    // is matched against `frame-src` as `'self'`, and inherits this policy.
    `frame-src ${ownOrigin ? "'self'" : "'none'"}`,
    "child-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function buildArtifactCspContent(extraScriptSources: readonly string[] = []): string {
  return artifactCspDirectives(false, extraScriptSources);
}

export const ARTIFACT_CSP_CONTENT = buildArtifactCspContent();

export const ARTIFACT_RENDERER_CSP_CONTENT = artifactCspDirectives(true, []);

export function extractMetaCspContent(html: string): string | null {
  const meta = html.match(
    /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i,
  )?.[0];
  const content = meta?.match(/content\s*=\s*"([^"]*)"/i)?.[1];
  if (content === undefined) return null;
  return content.replace(/\s+/g, ' ').trim();
}
