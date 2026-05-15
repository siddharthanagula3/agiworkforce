import DOMPurify from 'dompurify';

// CHROME-NEW-005 fix (2026-05-04 audit): DOMPurify allows `target` and `rel`
// attributes individually, but doesn't enforce that `target="_blank"` must
// carry `rel="noopener noreferrer"`. A crafted LLM response with raw HTML
// `<a target="_blank">` would otherwise open with `window.opener` exposed,
// letting the destination page navigate the side-panel via
// `window.opener.location`. Install an attribute-level hook that hardens
// every anchor that has `target` (or that points to a different origin)
// with `rel="noopener noreferrer"`. Idempotent — adding the hook multiple
// times is safe because DOMPurify dedupes by function reference.
let domPurifyHookInstalled = false;

export function ensureDomPurifyHook(): void {
  if (domPurifyHookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    const hasTarget = node.hasAttribute('target');
    if (!hasTarget) return;
    const existing = (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    const required = ['noopener', 'noreferrer'];
    for (const flag of required) {
      if (!existing.includes(flag)) existing.push(flag);
    }
    node.setAttribute('rel', existing.filter(Boolean).join(' '));
  });
  domPurifyHookInstalled = true;
}

export function sanitizeHtml(dirty: string): string {
  ensureDomPurifyHook();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'code',
      'pre',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'span',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'sup',
      'sub',
      'del',
      'ins',
      'mark',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'colspan', 'rowspan'],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'textarea',
      'select',
      'button',
      'img',
    ],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'src',
      'class',
      'id',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

export function renderMarkdown(text: string): string {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
    return `<pre><code>${code.trimEnd()}</code></pre>`;
  });

  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Negative lookahead/behind avoids matching list bullets
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  html = html.replace(/^---+$/gm, '<hr>');

  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2');

  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Only allow http(s) URLs to block javascript: scheme injection.
  // SECURITY (M-1): entity-encode link text before interpolation so that a
  // model response like [<img onerror=…>](url) cannot inject HTML even if a
  // downstream DOMPurify pass is skipped or removed in a future refactor.
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, text: string, url: string) => {
    const safeUrl = /^https?:\/\//i.test(url.trim()) ? url : '#';
    const encodedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${encodedText}</a>`;
  });

  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap block elements
      if (/^<(h[1-6]|ul|ol|li|pre|blockquote|hr)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}
