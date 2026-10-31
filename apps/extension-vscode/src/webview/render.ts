import markdownit from 'markdown-it';
import {
  markdownItFenceSource,
  normalizeMarkdownSource,
} from '@agiworkforce/utils/markdown-source';
import {
  classifyAssistantFence,
  renderClassifiedFenceHtml,
} from '@agiworkforce/unified-chat/assistant-fence';
import DOMPurify, { type Config } from 'dompurify';
import { findPathReferences } from '../utils/pathReferences';

const md = markdownit({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

const DIFF_LANGUAGES = new Set(['diff', 'patch']);

function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-file';
  if (line.startsWith('@@')) return 'diff-hunk';
  if (line.startsWith('+')) return 'diff-add';
  if (line.startsWith('-')) return 'diff-del';
  return 'diff-context';
}

function renderCodeBody(content: string, language: string): string {
  if (!DIFF_LANGUAGES.has(language.toLowerCase())) return md.utils.escapeHtml(content);
  return content
    .split('\n')
    .map((line) => `<span class="${diffLineClass(line)}">${md.utils.escapeHtml(line)}</span>`)
    .join('\n');
}

function renderCodeBlock(content: string, language = ''): string {
  const languageClass = language ? ` class="language-${md.utils.escapeHtml(language)}"` : '';
  return [
    '<div class="code-block-wrapper">',
    '<div class="code-block-actions">',
    '<button type="button" class="copy-btn" aria-label="Copy code">Copy</button>',
    '<button type="button" class="explain-btn" aria-label="Explain this code">Explain</button>',
    '<button type="button" class="apply-btn" aria-label="Apply code changes">Apply</button>',
    '</div>',
    `<pre><code${languageClass}>${renderCodeBody(content, language)}</code></pre>`,
    '</div>',
    '',
  ].join('\n');
}

md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const language = info ? info.split(/\s+/u, 1)[0] : '';
  const surface = renderClassifiedFenceHtml(
    classifyAssistantFence(language ?? '', markdownItFenceSource(token.content)),
    'vscode',
  );
  if (surface !== null) return surface;
  return renderCodeBlock(token.content, language);
};

md.renderer.rules.code_block = (tokens, index) => {
  const token = tokens[index];
  return token ? renderCodeBlock(token.content) : '';
};

export const PURIFY_CONFIG: Config = {
  FORBID_TAGS: [
    'img',
    'picture',
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

export interface AnswerSurfaceActions {
  onFollowUp?: (text: string) => void;
  copy?: (text: string) => Promise<void> | void;
}

export function bindAnswerSurfaces(root: ParentNode, actions: AnswerSurfaceActions = {}): void {
  root.querySelectorAll<HTMLButtonElement>('.surface-copy').forEach((button) => {
    if (button.dataset['bound'] === '1') return;
    button.dataset['bound'] = '1';
    button.addEventListener('click', () => {
      const code = button.closest('.answer-surface')?.querySelector('.answer-copy code');
      const text = code?.textContent ?? '';
      void actions.copy?.(text);
    });
  });
  root.querySelectorAll<HTMLButtonElement>('.surface-followup').forEach((button) => {
    if (button.dataset['bound'] === '1') return;
    button.dataset['bound'] = '1';
    button.addEventListener('click', () => {
      const text = button.textContent ?? '';
      if (text) actions.onFollowUp?.(text);
    });
  });
  root.querySelectorAll<HTMLElement>('.answer-surface-checklist').forEach((section) => {
    section.querySelectorAll<HTMLButtonElement>('.surface-check').forEach((box) => {
      if (box.dataset['bound'] === '1') return;
      box.dataset['bound'] = '1';
      box.addEventListener('click', () => {
        const pressed = box.getAttribute('aria-pressed') === 'true';
        box.setAttribute('aria-pressed', pressed ? 'false' : 'true');
        const boxes = [...section.querySelectorAll<HTMLButtonElement>('.surface-check')];
        const done = boxes.filter((item) => item.getAttribute('aria-pressed') === 'true').length;
        const progress = section.querySelector('.answer-progress');
        if (progress) progress.textContent = `${done} of ${boxes.length}`;
      });
    });
  });
}

declare global {
  interface Window {
    agiRender?: (markdown: string) => string;
    agiBindSurfaces?: (root: ParentNode, actions?: AnswerSurfaceActions) => void;
    DOMPurify?: typeof DOMPurify;
  }
}

export const PATH_LINK_CLASS = 'path-link';

/**
 * Turn `src/app.ts:12:4` in already-sanitized model output into a span the
 * sidebar script can hand back to the extension host. The pass runs after
 * DOMPurify so nothing here widens what the sanitizer allowed, and it skips
 * text already inside an anchor.
 */
function linkifyPathReferences(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (parent === null || parent.closest('a') !== null) continue;
    const references = findPathReferences(textNode.data);
    if (references.length === 0) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const reference of references) {
      if (reference.start < cursor) continue;
      fragment.appendChild(document.createTextNode(textNode.data.slice(cursor, reference.start)));
      const span = document.createElement('span');
      span.className = PATH_LINK_CLASS;
      span.setAttribute('role', 'link');
      span.setAttribute('tabindex', '0');
      span.dataset['path'] = reference.path;
      if (reference.line !== undefined) span.dataset['line'] = String(reference.line);
      if (reference.column !== undefined) span.dataset['column'] = String(reference.column);
      const end = reference.start + reference.length;
      span.textContent = textNode.data.slice(reference.start, end);
      fragment.appendChild(span);
      cursor = end;
    }
    fragment.appendChild(document.createTextNode(textNode.data.slice(cursor)));
    textNode.replaceWith(fragment);
  }
}

function render(markdown: string): string {
  if (typeof markdown !== 'string') return '';
  const html = md.render(normalizeMarkdownSource(markdown));
  const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG);
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  linkifyPathReferences(template.content);
  return template.innerHTML;
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (
    node.tagName === 'BUTTON' &&
    (node.classList.contains('copy-btn') ||
      node.classList.contains('apply-btn') ||
      node.classList.contains('explain-btn'))
  ) {
    node.setAttribute('type', 'button');
  }
});

window.agiRender = render;
window.agiBindSurfaces = bindAnswerSurfaces;
window.DOMPurify = DOMPurify;
