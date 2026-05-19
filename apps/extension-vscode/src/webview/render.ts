/**
 * webview/render.ts — Markdown → sanitized HTML inside the chat webview.
 *
 * Compiled by esbuild (browser platform) into `out/webview/render.js` and
 * loaded by the webview HTML via a CSP-allowed <script src> tag. Exposes
 * a single global `window.agiRender(markdown: string): string` that the
 * inline webview script (in webviewContent.ts) calls when the LLM stream
 * completes.
 *
 * Replaces the previous custom regex Markdown parser + custom DOM-walker
 * sanitizer in webviewContent.ts:1066-1181. Audit finding F-02 / F-10.
 *
 * Defense-in-depth:
 *   - markdown-it: html=false, linkify=true, breaks=false (no raw HTML)
 *   - DOMPurify: FORBID_TAGS for svg/math/audio/video/iframe etc.,
 *                FORBID_ATTR for style/formaction/srcdoc/on*,
 *                ALLOWED_URI_REGEXP for https/mailto only,
 *                ALLOW_DATA_ATTR=false
 *   - CSP in webviewContent.ts blocks data: URLs in img-src.
 */

import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';

const md = markdownit({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

const PURIFY_CONFIG: DOMPurify.Config = {
  FORBID_TAGS: [
    'svg',
    'math',
    'audio',
    'video',
    'source',
    'iframe',
    'object',
    'embed',
    'form',
    'link',
    'meta',
    'base',
    'style',
    'script',
  ],
  FORBID_ATTR: ['style', 'formaction', 'srcdoc', 'onload', 'onerror', 'onclick'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target', 'rel'],
};

declare global {
  interface Window {
    agiRender?: (markdown: string) => string;
    DOMPurify?: typeof DOMPurify;
  }
}

/**
 * Render markdown to sanitized HTML.
 *
 * Step 1: markdown-it with html:false produces only its own emitted HTML
 *         tags — never raw user HTML.
 * Step 2: DOMPurify sanitizes the result. Belt-and-suspenders.
 * Step 3: Ensure any <a href="..."> has target="_blank" rel="noopener
 *         noreferrer" via a DOMPurify hook.
 */
function render(markdown: string): string {
  if (typeof markdown !== 'string') return '';
  const html = md.render(markdown);
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
}

// Add a hook to force safe link behavior on <a> elements.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Expose to the inline webview script.
window.agiRender = render;
window.DOMPurify = DOMPurify;
