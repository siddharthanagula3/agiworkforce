
import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';

export type SanitizeLevel = 'strict' | 'standard' | 'extended';

const DEFAULT_ALLOWED_TAGS = [
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
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'code',
  'pre',
  'blockquote',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
];

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

export function sanitizeHTML(html: string, level: SanitizeLevel = 'standard'): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  let config: DOMPurifyConfig;

  switch (level) {
    case 'strict':
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
      config = {
        ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
        ALLOWED_ATTR: DEFAULT_ALLOWED_ATTRS,
        ALLOW_DATA_ATTR: true,
        ADD_TAGS: ['button', 'input', 'label', 'select', 'option', 'textarea'],
        ADD_ATTR: [
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
        FORBID_ATTR: [
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
      config = {
        ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
        ALLOWED_ATTR: DEFAULT_ALLOWED_ATTRS,
        ALLOW_DATA_ATTR: false,
      };
      break;
  }

  const sanitized = DOMPurify.sanitize(html, {
    ...config,
    SANITIZE_NAMED_PROPS: true,
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    WHOLE_DOCUMENT: false,
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

const FORBIDDEN_SANDBOX_VALUES = new Set([
  'allow-same-origin',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
]);

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

const SANDBOX_ADD_ATTR = [
  'type',
  'defer',
  'async',
  'crossorigin',
  'sandbox',
  'srcdoc',
  'loading',
  'referrerpolicy',
  'allow',
  'allowfullscreen',
  'rel',
  'integrity',
  'as',
  'controls',
  'autoplay',
  'loop',
  'muted',
  'playsinline',
  'poster',
  'preload',
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
  'tabindex',
  'contenteditable',
  'spellcheck',
  'draggable',
  'hidden',
  'open',
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
  if (typeof window === 'undefined' || typeof DOMPurify.addHook !== 'function') {
    return '';
  }
  const attrHookName = 'uponSanitizeAttribute';
  const attrHook = (...args: unknown[]) => {
    const data = args[1] as { attrName: string; forceKeepAttr: boolean } | undefined;
    if (data && /^on[a-z]/i.test(data.attrName)) {
      data.forceKeepAttr = true;
    }
  };

  const elHookName = 'afterSanitizeAttributes';
  const iframeHook = (...args: unknown[]) => {
    const node = args[0] as Element | undefined;
    if (!node || node.tagName?.toLowerCase() !== 'iframe') return;
    const s = node.getAttribute('sandbox');
    if (s === null) {
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
      FORCE_BODY: true,
      ALLOW_DATA_ATTR: true,
      ADD_TAGS: SANDBOX_ADD_TAGS,
      ADD_ATTR: SANDBOX_ADD_ATTR,
      FORBID_TAGS: ['base'],
    });
    return result as string;
  } finally {
    DOMPurify.removeHook(attrHookName);
    DOMPurify.removeHook(elHookName);
  }
}

// We keep this as a separate exported helper so tests can call it directly.
export function stripMetaRefreshFromSandboxHtml(html: string): string {
  return html.replace(/<meta[^>]*http-equiv\s*=\s*['"]?refresh['"]?[^>]*>/gi, '');
}

export const ARTIFACT_SCRIPT_CDN_HOSTS = [
  'https://unpkg.com',
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://esm.sh',
] as const;

/**
 * AUDIT-FIX ART-6 / ART-14: build the artifact Content-Security-Policy value.
 *
 * @param extraScriptSources Additional `script-src` sources for a renderer
 *   that bootstraps from a host outside {@link ARTIFACT_SCRIPT_CDN_HOSTS}.
 */
export function buildArtifactCspContent(extraScriptSources: readonly string[] = []): string {
  const scriptSrc = [
    "'unsafe-inline'",
    "'unsafe-eval'",
    ...ARTIFACT_SCRIPT_CDN_HOSTS,
    ...extraScriptSources,
  ];
  return [
    "default-src 'none'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'unsafe-inline' https:",
    'img-src data: blob: https:',
    'font-src data: https:',
    'media-src data: blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function buildArtifactCspMeta(extraScriptSources: readonly string[] = []): string {
  return `<meta http-equiv="Content-Security-Policy" content="${buildArtifactCspContent(
    extraScriptSources,
  )}">`;
}

export function escapeForInlineScript(source: string): string {
  return source.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

const SANDBOX_CSP_META = buildArtifactCspMeta();

export function buildSandboxSrcDoc(html: string): string {
  if (!html || typeof html !== 'string') {
    return '<!DOCTYPE html><html><head></head><body></body></html>';
  }

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
  return runSandboxDOMPurify(html, false);
}

/**
 * @deprecated Use buildSandboxSrcDoc() instead.
 * Kept for backward compatibility with existing tests.
 */
export function sanitizeHtmlForSandbox(html: string): string {
  return stripMetaRefreshFromSandboxHtml(sanitizeArtifactForSandbox(html));
}

export function sanitizeArtifact(
  content: string,
  type: 'html' | 'react' | 'svg' | 'mermaid' | 'code',
): string {
  switch (type) {
    case 'html':
      return sanitizeHTML(content, 'extended');

    case 'svg':
      return sanitizeSVG(content);

    case 'react':
    case 'mermaid':
    case 'code':
      return sanitizeHTML(`<pre><code>${escapeHTML(content)}</code></pre>`, 'strict');

    default:
      return sanitizeHTML(content, 'standard');
  }
}

export function sanitizeSVG(svg: string): string {
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

export function sanitizeUserInput(input: string, maxLength: number = 10000): string {
  let sanitized = input.trim().slice(0, maxLength);

  sanitized = sanitized.replace(/\0/g, '');

  sanitized = escapeHTML(sanitized);

  return sanitized;
}

export function stripHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
  });
}

export function sanitizeURL(url: string): string {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return url;
  } catch {
    return '';
  }
}
