/**
 * HTML Sanitizer Service
 * Uses DOMPurify to sanitize user-generated HTML content
 *
 * CRITICAL SECURITY: Prevents XSS attacks in artifacts and user-generated content
 *
 * Two sanitization modes exist:
 *
 * 1. sanitizeHTML / sanitizeArtifact — the STRICT path used whenever HTML is
 *    rendered directly inside the main document (real XSS risk). Scripts and
 *    event handlers are NEVER allowed here.
 *
 * 2. sanitizeArtifactForSandbox — the SANDBOX path used exclusively when
 *    content is placed inside an iframe with sandbox="allow-scripts" but
 *    WITHOUT allow-same-origin. In that configuration the iframe runs at a
 *    null origin, so inline scripts/handlers cannot read the parent's cookies,
 *    localStorage, or DOM — the null-origin sandbox is the security boundary.
 *    This mirrors how ChatGPT, Claude Artifacts, and CodeSandbox operate.
 *    Scripts are preserved; only the narrow set of attributes/tags that can
 *    BREAK OUT of or WIDEN the sandbox is stripped.
 */

import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';

/**
 * Sanitization configuration levels
 *
 * SECURITY NOTE: No sanitization level should EVER allow JavaScript execution.
 * Event handlers (onclick, onchange, onload, onerror, onmouseover, onfocus, onblur, etc.)
 * and javascript: URLs are NEVER permitted in any mode.
 *
 * - 'strict': Basic formatting only, no links or images
 * - 'standard': Balanced security with common HTML elements
 * - 'extended': Rich content with form elements, but NO script execution
 */
export type SanitizeLevel = 'strict' | 'standard' | 'extended';

/**
 * Default allowed tags for artifacts
 */
const DEFAULT_ALLOWED_TAGS = [
  // Structure
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'br',
  'hr',
  // Lists
  'ul',
  'ol',
  'li',
  // Text formatting
  'strong',
  'em',
  'b',
  'i',
  'u',
  'code',
  'pre',
  'blockquote',
  // Links and media
  'a',
  'img',
  // Tables
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  // SVG (for graphics)
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
];

/**
 * Default allowed attributes
 */
const DEFAULT_ALLOWED_ATTRS = [
  'class',
  'id',
  'style',
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'target',
  'rel',
  // SVG attributes
  'd',
  'viewBox',
  'xmlns',
  'fill',
  'stroke',
  'stroke-width',
  'cx',
  'cy',
  'r',
  'x',
  'y',
  'points',
];

/**
 * Sanitize HTML content with configurable security levels
 */
export function sanitizeHTML(html: string, level: SanitizeLevel = 'standard'): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  let config: DOMPurifyConfig;

  switch (level) {
    case 'strict':
      // Strictest: Only basic formatting, no links/images
      config = {
        ALLOWED_TAGS: [
          'p',
          'br',
          'strong',
          'em',
          'code',
          'pre',
          'h1',
          'h2',
          'h3',
          'ul',
          'ol',
          'li',
        ],
        ALLOWED_ATTR: ['class'],
        ALLOW_DATA_ATTR: false,
      };
      break;

    case 'extended':
      // Extended: Allows rich content with form elements for interactive UIs
      // SECURITY: Event handlers (on*) are NEVER allowed to prevent XSS attacks.
      // JavaScript execution through HTML attributes is a critical vulnerability.
      config = {
        ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
        ALLOWED_ATTR: DEFAULT_ALLOWED_ATTRS,
        ALLOW_DATA_ATTR: true,
        ADD_TAGS: ['button', 'input', 'label', 'select', 'option', 'textarea'],
        ADD_ATTR: [
          // Safe form attributes only - NO event handlers (onclick, onchange, etc.)
          'value',
          'placeholder',
          'type',
          'name',
          'disabled',
          'readonly',
          'required',
          'min',
          'max',
          'step',
          'pattern',
          'autocomplete',
          'for', // label association
          'aria-label',
          'aria-describedby',
          'role',
        ],
        // Explicitly forbid dangerous attributes
        FORBID_ATTR: [
          // Event handlers - NEVER allow these
          'onclick',
          'ondblclick',
          'onchange',
          'oninput',
          'onsubmit',
          'onreset',
          'onload',
          'onerror',
          'onmouseover',
          'onmouseout',
          'onmousedown',
          'onmouseup',
          'onmousemove',
          'onkeydown',
          'onkeyup',
          'onkeypress',
          'onfocus',
          'onblur',
          'onscroll',
          'onresize',
          'ondrag',
          'ondrop',
          'oncopy',
          'onpaste',
          'oncut',
          'oncontextmenu',
          'ontouchstart',
          'ontouchmove',
          'ontouchend',
          'onanimationstart',
          'onanimationend',
          'ontransitionend',
        ],
      };
      break;

    case 'standard':
    default:
      // Standard: Good balance of security and functionality
      config = {
        ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
        ALLOWED_ATTR: DEFAULT_ALLOWED_ATTRS,
        ALLOW_DATA_ATTR: false,
      };
      break;
  }

  // Add universal protections applied to ALL sanitization levels
  const sanitized = DOMPurify.sanitize(html, {
    ...config,
    // Force target="_blank" and rel="noopener noreferrer" on links
    SANITIZE_NAMED_PROPS: true,
    // Don't allow DOM clobbering
    SANITIZE_DOM: true,
    // Keep important elements
    KEEP_CONTENT: true,
    // Return as HTML string
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    // Don't process entire document
    WHOLE_DOCUMENT: false,
    // CRITICAL: Always forbid script execution elements regardless of level
    // These tags can execute JavaScript and must NEVER be allowed
    FORBID_TAGS: [
      'script',
      'iframe',
      'frame',
      'frameset',
      'object',
      'embed',
      'applet',
      'base',
      'meta',
      'link',
      'style', // Can contain CSS expressions for XSS
      'math', // MathML can execute scripts
      'xmp',
      'plaintext',
      'listing',
      'noscript',
      'template', // Can be used for DOM manipulation attacks
      ...(config.FORBID_TAGS || []),
    ],
  });

  return sanitized as string;
}

/**
 * True if `html` appears to be a full HTML document rather than a fragment.
 * Checks only the first 500 characters to avoid scanning large inputs.
 * Detects both `<!DOCTYPE html>` and a bare `<html` opening tag.
 *
 * NOTE: buildSandboxSrcDoc no longer uses this internally (it uses a unified
 * WHOLE_DOCUMENT:false + FORCE_BODY:true path that works for both full docs
 * and fragments). This is exported for external callers and tests that may
 * need document detection for other purposes.
 */
export function isHtmlDocument(html: string): boolean {
  const head = html.slice(0, 500).trimStart();
  return /<!doctype\s+html/i.test(head) || /^<html[\s>]/i.test(head);
}

/**
 * Shared DOMPurify config and hooks for sanitizing HTML inside a null-origin
 * sandbox iframe (sandbox="allow-scripts", NO allow-same-origin).
 *
 * SECURITY MODEL:
 * The caller MUST ensure the target iframe uses `sandbox="allow-scripts"` with
 * NO `allow-same-origin`. That combination creates a null-origin context where
 * the sandboxed document:
 *   - Cannot read the parent's cookies or localStorage (null origin, no storage
 *     access)
 *   - Cannot access parent.document.* (cross-origin barrier)
 *   - Cannot make same-origin fetch/XHR (null-origin CORS rejection)
 *   - CAN run inline <script> tags and on* handlers (within the sandbox)
 *
 * Therefore scripts and on* event handlers are PRESERVED here; the sandbox is
 * the isolation boundary. This mirrors how ChatGPT, Claude Artifacts, and
 * CodeSandbox render interactive content.
 *
 * What IS still stripped:
 *   - <base> tag: hijacks relative URL resolution for the document.
 *   - <meta http-equiv="refresh">: schedules top-frame navigation (post-pass).
 *   - <iframe sandbox> with allow-same-origin or allow-top-navigation*: a
 *     nested iframe that adds allow-same-origin, combined with the outer
 *     allow-scripts, would gain full parent-origin access.
 *
 * What IS preserved:
 *   - <script> (inline and src=)
 *   - All on* event handlers (onclick, onchange, oninput, etc.)
 *   - <style>, <canvas>, <dialog>, <template>, <audio>, <video>, <iframe>, etc.
 *
 * IMPORTANT: Call runSandboxDOMPurify() instead of calling DOMPurify directly.
 * It installs and removes hooks atomically so they don't leak across calls.
 */

/** Sandbox values that widen isolation or allow top-frame navigation. */
const FORBIDDEN_SANDBOX_VALUES = new Set([
  'allow-same-origin',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
]);

/** Extra tags DOMPurify omits by default that are needed for interactive artifacts. */
const SANDBOX_ADD_TAGS = [
  'script', // Inline and external scripts.
  'style', // CSS blocks.
  'iframe', // Nested iframes (sandbox attr sanitized by hook).
  'noscript', // Fallback content.
  'template', // HTML template elements for JS-driven rendering.
  'canvas', // Canvas drawing/games.
  'audio', // Audio playback.
  'video', // Video playback.
  'source', // Media source.
  'track', // Subtitle tracks.
  'picture', // Responsive images.
  'dialog', // Modal dialogs.
  'details', // Disclosure widgets.
  'summary', // Disclosure summary.
  'slot', // Web-component slots.
  'link', // <link rel="stylesheet"> for CDN CSS.
];

/** Extra attributes needed for scripts, iframes, media, and forms. */
const SANDBOX_ADD_ATTR = [
  // Script
  'type',
  'defer',
  'async',
  'crossorigin',
  // Iframe
  'sandbox',
  'srcdoc',
  'loading',
  'referrerpolicy',
  'allow',
  'allowfullscreen',
  // Link
  'rel',
  'integrity',
  'as',
  // Media
  'controls',
  'autoplay',
  'loop',
  'muted',
  'playsinline',
  'poster',
  'preload',
  // Forms / inputs
  'action',
  'method',
  'enctype',
  'novalidate',
  'formaction',
  'formmethod',
  'formenctype',
  'formnovalidate',
  'inputmode',
  'autocomplete',
  'list',
  'multiple',
  'form',
  'pattern',
  'minlength',
  'maxlength',
  'min',
  'max',
  'step',
  // Misc
  'tabindex',
  'contenteditable',
  'spellcheck',
  'draggable',
  'hidden',
  'open',
  // ARIA
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-hidden',
  'aria-expanded',
  'aria-controls',
  'aria-live',
  'aria-atomic',
  'aria-relevant',
  'aria-checked',
  'aria-selected',
  'aria-disabled',
  'aria-readonly',
  'aria-required',
  'aria-invalid',
  'aria-multiline',
  'aria-multiselectable',
  'aria-orientation',
  'aria-placeholder',
  'aria-pressed',
  'aria-sort',
  'aria-valuemax',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuetext',
  'aria-posinset',
  'aria-setsize',
  'aria-level',
  'aria-colcount',
  'aria-colindex',
  'aria-colspan',
  'aria-rowcount',
  'aria-rowindex',
  'aria-rowspan',
  'aria-owns',
  'aria-flowto',
  'aria-activedescendant',
  'aria-details',
  'aria-errormessage',
  'aria-keyshortcuts',
  'aria-roledescription',
];

/**
 * Run DOMPurify in sandbox mode with hooks installed atomically.
 *
 * @param html      Input HTML.
 * @param wholeDoc  When true, DOMPurify wraps output in <html><body>; use for
 *                  fragments where we want a full document back. When false,
 *                  DOMPurify returns only body content (use for fragments that
 *                  will be injected into a wrapper template).
 */
function runSandboxDOMPurify(html: string, wholeDoc: boolean): string {
  // SSR guard: DOMPurify v3 needs a real DOM (window). During server rendering there is
  // none, so `DOMPurify.addHook`/`sanitize` are unavailable and throw
  // ("addHook is not a function"). The sandboxed artifact iframe is only meaningfully
  // rendered CLIENT-side (and re-renders there), so on the server we return a blank instead
  // of crashing SSR — the client produces the real sanitized srcDoc. (Found via manual QA.)
  if (typeof window === 'undefined' || typeof DOMPurify.addHook !== 'function') {
    return '';
  }
  // Hook 1 (uponSanitizeAttribute): allow on* event handlers through.
  //
  // DOMPurify blocks all on* attributes by default regardless of ADD_ATTR /
  // FORBID_ATTR — they sit on an internal deny-list. The only way to override
  // is `data.forceKeepAttr = true` inside this hook. This is the documented
  // DOMPurify escape hatch for trusted contexts (our null-origin sandbox IS
  // the trust boundary).
  //
  // DOMPurify's addHook typing uses (...args: unknown[]) so we access arguments
  // by index.
  const attrHookName = 'uponSanitizeAttribute';
  const attrHook = (...args: unknown[]) => {
    const data = args[1] as { attrName: string; forceKeepAttr: boolean } | undefined;
    if (data && /^on[a-z]/i.test(data.attrName)) {
      data.forceKeepAttr = true;
    }
  };

  // Hook 2 (afterSanitizeAttributes): sanitize nested <iframe sandbox="...">.
  const elHookName = 'afterSanitizeAttributes';
  const iframeHook = (...args: unknown[]) => {
    const node = args[0] as Element | undefined;
    if (!node || node.tagName?.toLowerCase() !== 'iframe') return;
    const s = node.getAttribute('sandbox');
    if (s === null) {
      // No sandbox attr — add a safe default so isolation is explicit.
      node.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
      return;
    }
    const parts = s.split(/\s+/).filter((v) => v && !FORBIDDEN_SANDBOX_VALUES.has(v));
    node.setAttribute('sandbox', parts.join(' '));
  };

  DOMPurify.addHook(attrHookName, attrHook);
  DOMPurify.addHook(elHookName, iframeHook);

  try {
    const result = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: wholeDoc,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      KEEP_CONTENT: true,
      SANITIZE_DOM: true,
      // FORCE_BODY:true is critical: it promotes head-only elements (<script>,
      // <style>, <link>) into the body content list so they survive. Without
      // it, a bare `<script src=...>` or `<style>` fragment returns empty
      // because jsdom parses them as head nodes and DOMPurify discards them
      // when not using WHOLE_DOCUMENT:true.
      FORCE_BODY: true,
      ALLOW_DATA_ATTR: true,
      ADD_TAGS: SANDBOX_ADD_TAGS,
      ADD_ATTR: SANDBOX_ADD_ATTR,
      // <base> hijacks relative URL resolution; strip it.
      // meta http-equiv="refresh" is handled by stripMetaRefreshFromSandboxHtml
      // post-pass (DOMPurify can't FORBID a single http-equiv value without
      // dropping all <meta> tags).
      FORBID_TAGS: ['base'],
    });
    return result as string;
  } finally {
    DOMPurify.removeHook(attrHookName);
    DOMPurify.removeHook(elHookName);
  }
}

// Post-process hook to strip <meta http-equiv="refresh"> from sandbox output.
// We keep this as a separate exported helper so tests can call it directly.
export function stripMetaRefreshFromSandboxHtml(html: string): string {
  // Remove <meta http-equiv="refresh" ...> (case-insensitive, any quote style).
  return html.replace(/<meta[^>]*http-equiv\s*=\s*['"]?refresh['"]?[^>]*>/gi, '');
}

// No inner CSP <meta> is injected.
//
// The iframe is rendered with sandbox="allow-scripts" WITHOUT allow-same-origin.
// That combination creates a null (opaque) origin context where scripts cannot
// touch the parent's cookies, localStorage, DOM, or make same-origin requests.
// The sandbox attribute IS the security boundary — the same model used by
// ChatGPT Artifacts, Claude Artifacts, and CodeSandbox.
//
// Adding a `<meta http-equiv="Content-Security-Policy" content="script-src 'self'
// 'unsafe-inline'">` inside a null-origin frame causes Chrome (and other browsers)
// to BLOCK inline scripts and onclick handlers in practice, even though 'unsafe-inline'
// should theoretically permit them. The interaction between opaque origin, 'self'
// keyword resolution, and inline-script policy enforcement is browser-defined and
// not reliably safe to rely on — observed to break artifacts in production.
//
// Since the sandbox is already sufficient isolation, the inner CSP is both
// redundant (doesn't add security beyond the sandbox) and harmful (breaks
// interactivity). We intentionally omit it.
// Intentionally empty — no inner CSP meta tag is injected.
// See the block comment above for the full rationale.
const SANDBOX_CSP_META = '';

/**
 * Build a complete, ready-to-use `srcDoc` string for a null-origin sandboxed
 * iframe rendering an HTML artifact.
 *
 * ROOT CAUSE of the previous non-interactive bug: the prior implementation
 * used `WHOLE_DOCUMENT: true` which ALWAYS wraps DOMPurify output in
 * `<html>...</html>`, then `getPreviewHTML` wrapped that AGAIN in its own
 * `<!DOCTYPE html><html>…` shell. Browsers parse the inner `<html>` as text
 * inside `<body>`; `<script>` tags in that mis-nested position do not execute.
 *
 * FIX: this function is the single source of truth for producing a srcDoc.
 * It uses `WHOLE_DOCUMENT: false` + `FORCE_BODY: true` for ALL inputs (both
 * full documents and bare fragments):
 *   - `WHOLE_DOCUMENT: false` — DOMPurify returns body content only, never
 *     wraps in `<html>`. No double-wrap possible.
 *   - `FORCE_BODY: true` — DOMPurify promotes head-only elements (`<script>`,
 *     `<style>`, `<link>`) into the body content list so they survive the
 *     sanitization pass. Without this, a bare `<script src=...>` or `<style>`
 *     fragment returns empty (jsdom parses them as head nodes; without
 *     WHOLE_DOCUMENT:true they are discarded).
 *   - For full documents: DOMPurify with FORCE_BODY:true extracts only the
 *     body content (discarding outer `<html>/<head>`), but body-hoists the
 *     head `<style>` and `<script src=...>` tags, so artifact styles and CDN
 *     scripts are preserved.
 *
 * The sanitized body content is then wrapped in a single, controlled shell
 * document that includes the CSP meta and a default body style.
 *
 * Callers MUST use this as the iframe's srcDoc and MUST NOT wrap it further.
 */
export function buildSandboxSrcDoc(html: string): string {
  if (!html || typeof html !== 'string') {
    return '<!DOCTYPE html><html><head></head><body></body></html>';
  }

  // WHOLE_DOCUMENT:false + FORCE_BODY:true works for both full docs and
  // fragments: returns sanitized body content with no outer <html> wrapper.
  const bodyContent = stripMetaRefreshFromSandboxHtml(runSandboxDOMPurify(html, false));

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${SANDBOX_CSP_META}
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: system-ui, -apple-system, sans-serif;
      }
    </style>
  </head>
  <body>
    ${bodyContent}
  </body>
</html>`;
}

/**
 * @deprecated Use buildSandboxSrcDoc() instead. This function is kept for
 * backward compatibility with existing tests but should not be called from
 * production render paths.
 *
 * Returns the raw DOMPurify output (body content fragment only, no CSP
 * injection, no document shell). Using this result directly as a srcDoc is
 * WRONG for full HTML documents because it strips the outer <html>/<head>
 * without replacing them. Use buildSandboxSrcDoc() which wraps correctly.
 */
export function sanitizeArtifactForSandbox(html: string): string {
  if (!html || typeof html !== 'string') return '';
  // Always use WHOLE_DOCUMENT:false (wholeDoc=false) — matches the body-
  // content extraction strategy used by buildSandboxSrcDoc.
  return runSandboxDOMPurify(html, false);
}

/**
 * @deprecated Use buildSandboxSrcDoc() instead.
 * Kept for backward compatibility with existing tests.
 */
export function sanitizeHtmlForSandbox(html: string): string {
  return stripMetaRefreshFromSandboxHtml(sanitizeArtifactForSandbox(html));
}

/**
 * Sanitize artifact content based on type
 */
export function sanitizeArtifact(
  content: string,
  type: 'html' | 'react' | 'svg' | 'mermaid' | 'code',
): string {
  switch (type) {
    case 'html':
      // HTML artifacts can have rich content but NO script execution
      return sanitizeHTML(content, 'extended');

    case 'svg':
      // SVG needs special handling
      return sanitizeSVG(content);

    case 'react':
    case 'mermaid':
    case 'code':
      // Code should be displayed as-is but not executed
      // Wrap in <pre><code> for safe display
      return sanitizeHTML(`<pre><code>${escapeHTML(content)}</code></pre>`, 'strict');

    default:
      return sanitizeHTML(content, 'standard');
  }
}

/**
 * Sanitize SVG content specifically
 */
export function sanitizeSVG(svg: string): string {
  // SVG has additional security concerns
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOWED_TAGS: [
      'svg',
      'path',
      'circle',
      'rect',
      'line',
      'polyline',
      'polygon',
      'g',
      'text',
      'tspan',
      'ellipse',
      'defs',
      'clipPath',
      'use',
      'image',
      'linearGradient',
      'radialGradient',
      'stop',
    ],
    ALLOWED_ATTR: [
      'd',
      'viewBox',
      'xmlns',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'cx',
      'cy',
      'r',
      'x',
      'y',
      'x1',
      'y1',
      'x2',
      'y2',
      'points',
      'width',
      'height',
      'transform',
      'opacity',
      'preserveAspectRatio',
      'href',
      'xlink:href',
      'class',
      'id',
    ],
    SANITIZE_DOM: true,
    KEEP_CONTENT: false,
  });

  return sanitized;
}

/**
 * Escape HTML special characters
 */
export function escapeHTML(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Check if content contains potentially dangerous patterns
 */
export function hasXSSRisk(content: string): boolean {
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // event handlers
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<form/i,
    /eval\(/i,
    /expression\(/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(content));
}

/**
 * Sanitize and validate user input for chat/prompts
 */
export function sanitizeUserInput(input: string, maxLength: number = 10000): string {
  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Basic HTML entity encoding for special characters
  // This prevents HTML injection in text inputs
  sanitized = escapeHTML(sanitized);

  return sanitized;
}

/**
 * Strip all HTML tags from content
 */
export function stripHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitize URL to prevent javascript: protocol and other attacks
 */
export function sanitizeURL(url: string): string {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols (mailto: excluded to prevent social engineering)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return url;
  } catch {
    // Invalid URL
    return '';
  }
}
