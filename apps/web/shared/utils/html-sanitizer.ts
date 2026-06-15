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
 * Sanitize HTML artifact content for rendering inside a sandboxed iframe
 * (sandbox="allow-scripts" WITHOUT allow-same-origin).
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
 * Therefore this function PRESERVES <script>, on* event handlers, and <style>
 * so that interactive artifacts work — the sandbox is the isolation boundary.
 *
 * What IS still stripped (things that can escape the sandbox or widen it):
 *
 *   <iframe sandbox="...allow-same-origin..."> or "...allow-top-navigation..."
 *     — a nested iframe can re-add `allow-same-origin` which, combined with
 *       the outer `allow-scripts`, would grant it full parent-origin access.
 *       We allow <iframe> but forcibly remove dangerous sandbox values via a
 *       DOMPurify hook. We also strip allow-top-navigation because it lets
 *       the child navigate the top browsing context.
 *       Preserved sandbox values: allow-scripts (harmless — already null
 *       origin), allow-forms, allow-modals, allow-popups (opens new windows,
 *       acceptable), allow-presentation.
 *       Stripped values: allow-same-origin, allow-top-navigation,
 *       allow-top-navigation-by-user-activation,
 *       allow-top-navigation-to-custom-protocols.
 *
 *   <base href="...">
 *     — Can hijack relative URLs inside the iframe document. Not dangerous
 *       for the parent directly but can redirect artifact resources in
 *       confusing ways. Stripped.
 *
 *   <meta http-equiv="refresh" ...>
 *     — Schedules a top-frame navigation in some browser/sandbox
 *       combinations. Stripped. Other <meta> tags (charset, viewport) are
 *       preserved so the artifact can set its own encoding/viewport.
 *
 *   javascript: and data: URL navigation targets in <a href> / form action
 *     — javascript: on <a> can execute code. DOMPurify's default URL
 *       sanitization blocks javascript: and data: hrefs already; we rely on
 *       that for links. Form actions to external origins are a data-exfil
 *       risk (POST via null-origin can carry form data) — we leave forms
 *       intact because the threat model accepts that artifacts can make
 *       network requests (they're interactive documents), and no auth tokens
 *       are accessible from the null-origin context.
 *
 * What IS preserved:
 *   - <script> with any src or inline body
 *   - All on* event handlers (onclick, onchange, etc.)
 *   - <style> blocks
 *   - <link rel="stylesheet"> (external CSS)
 *   - <iframe> (with dangerous sandbox values stripped as above)
 *   - All standard HTML including <form>, <input>, <button>, <canvas>, etc.
 */
export function sanitizeArtifactForSandbox(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Values that widen the sandbox or allow top-frame navigation from a nested
  // iframe. Stripping these prevents a child iframe from re-acquiring
  // allow-same-origin (which, combined with outer allow-scripts, gives full
  // parent-origin access) or navigating the top browsing context.
  const FORBIDDEN_SANDBOX_VALUES = new Set([
    'allow-same-origin',
    'allow-top-navigation',
    'allow-top-navigation-by-user-activation',
    'allow-top-navigation-to-custom-protocols',
  ]);

  // Hook 1 (uponSanitizeAttribute): allow on* event handlers through.
  //
  // DOMPurify blocks all on* attributes by default regardless of ADD_ATTR /
  // FORBID_ATTR — they sit on an internal deny-list. The only way to override
  // is `data.forceKeepAttr = true` inside this hook. This is the documented
  // DOMPurify escape hatch for trusted contexts (our null-origin sandbox IS
  // the trust boundary).
  //
  // DOMPurify's addHook typing uses (...args: unknown[]) so we access the
  // second argument (the SanitizeAttributeHookEvent) via index.
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

    const sandboxAttr = node.getAttribute('sandbox');
    if (sandboxAttr === null) {
      // No sandbox attr — add a safe default. Without an explicit sandbox the
      // nested iframe inherits the outer sandbox's allow-* set, which is fine
      // for now but could widen if the outer ever changes. Explicit is safer.
      node.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
      return;
    }

    const parts = sandboxAttr.split(/\s+/).filter((v) => v && !FORBIDDEN_SANDBOX_VALUES.has(v));
    node.setAttribute('sandbox', parts.join(' '));
  };

  DOMPurify.addHook(attrHookName, attrHook);
  DOMPurify.addHook(elHookName, iframeHook);

  try {
    const sanitized = DOMPurify.sanitize(html, {
      // Accept full HTML documents (head + body) so artifacts that provide a
      // complete document structure are not truncated.
      WHOLE_DOCUMENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      KEEP_CONTENT: true,
      SANITIZE_DOM: true,
      FORCE_BODY: true,
      ALLOW_DATA_ATTR: true,
      // Bring in tags DOMPurify omits by default.
      ADD_TAGS: [
        'script', // Inline and external scripts — the whole point of this path.
        'style', // CSS blocks.
        'iframe', // Nested iframes (sandbox sanitized by hook above).
        'noscript', // Fallback content for no-script environments.
        'template', // HTML template elements for JS-driven rendering.
        'canvas', // Canvas for drawing/game artifacts.
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
      ],
      // Bring in non-default attributes needed for scripts, iframes, media,
      // and forms. on* handlers are handled by the uponSanitizeAttribute hook
      // above (ADD_ATTR cannot express wildcards).
      ADD_ATTR: [
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
      ],
      // Strip the narrow set of things that can escape the sandbox:
      //   <base> — hijacks relative URL resolution for the document.
      // (meta http-equiv="refresh" is handled by stripMetaRefreshFromSandboxHtml
      // because DOMPurify can't FORBID a single http-equiv value without
      // dropping all <meta> tags.)
      FORBID_TAGS: ['base'],
    });

    return sanitized as string;
  } finally {
    // Always remove both hooks to avoid accumulation across calls.
    DOMPurify.removeHook(attrHookName);
    DOMPurify.removeHook(elHookName);
  }
}

// Post-process hook to strip <meta http-equiv="refresh"> from sandbox output.
// We can't use FORBID_ATTR because we only want to block this specific
// http-equiv value, not all http-equiv attributes.
//
// This is applied as a separate string-based pass because DOMPurify's
// attribute hooks fire per-attribute but we need to inspect the combination
// of tag + attribute value.
// We keep a separate exported helper so tests can call it directly.
export function stripMetaRefreshFromSandboxHtml(html: string): string {
  // Remove <meta http-equiv="refresh" ...> (case-insensitive, any quote style).
  return html.replace(/<meta[^>]*http-equiv\s*=\s*['"]?refresh['"]?[^>]*>/gi, '');
}

/**
 * Full sandbox-safe sanitization: DOMPurify pass + meta-refresh strip.
 * Use this instead of calling sanitizeArtifactForSandbox directly; it
 * applies both layers.
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
