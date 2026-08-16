
import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';

const md = markdownit({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

function renderCodeBlock(content: string, language = ''): string {
  const languageClass = language ? ` class="language-${md.utils.escapeHtml(language)}"` : '';
  return [
    '<div class="code-block-wrapper">',
    '<div class="code-block-actions">',
    '<button type="button" class="copy-btn" aria-label="Copy code">Copy</button>',
    '<button type="button" class="apply-btn" aria-label="Apply code changes">Apply</button>',
    '</div>',
    `<pre><code${languageClass}>${md.utils.escapeHtml(content)}</code></pre>`,
    '</div>',
    '',
  ].join('\n');
}

md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const language = info ? info.split(/\s+/u, 1)[0] : '';
  return renderCodeBlock(token.content, language);
};

md.renderer.rules.code_block = (tokens, index) => {
  const token = tokens[index];
  return token ? renderCodeBlock(token.content) : '';
};

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

function render(markdown: string): string {
  if (typeof markdown !== 'string') return '';
  const html = md.render(markdown);
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (
    node.tagName === 'BUTTON' &&
    (node.classList.contains('copy-btn') || node.classList.contains('apply-btn'))
  ) {
    node.setAttribute('type', 'button');
  }
});

window.agiRender = render;
window.DOMPurify = DOMPurify;
