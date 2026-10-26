import markdownit from 'markdown-it';
import {
  closeUnterminatedCodeFence,
  normalizeMarkdownSource,
} from '@agiworkforce/utils/markdown-source';
import DOMPurify, { type Config } from 'dompurify';
import { findPathReferences, type PathReference } from '../utils/pathReferences';
import { MATH_ATTRIBUTE, mathPlugin } from './math';

const md = markdownit({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

md.use(mathPlugin);

const DIFF_LANGUAGES = new Set(['diff', 'patch']);
export const MERMAID_LANGUAGE = 'mermaid';
export const MERMAID_BLOCK_CLASS = 'code-block-wrapper--mermaid';
export const MERMAID_CLOSED_CLASS = 'code-block-wrapper--closed';

type RenderEnv = Record<string, unknown> & { openFenceEndLine: number | null };

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

function renderCodeBlock(content: string, language = '', closed = true): string {
  const languageClass = language ? ` class="language-${md.utils.escapeHtml(language)}"` : '';
  const wrapperClasses = ['code-block-wrapper'];
  if (language.toLowerCase() === MERMAID_LANGUAGE) {
    wrapperClasses.push(MERMAID_BLOCK_CLASS);
    if (closed) wrapperClasses.push(MERMAID_CLOSED_CLASS);
  }
  return [
    `<div class="${wrapperClasses.join(' ')}">`,
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

function fenceIsClosed(map: [number, number] | null, env: unknown): boolean {
  const openFenceEndLine = (env as Partial<RenderEnv> | undefined)?.openFenceEndLine ?? null;
  return openFenceEndLine === null || map === null || map[1] < openFenceEndLine;
}

md.renderer.rules.fence = (tokens, index, _options, env) => {
  const token = tokens[index];
  if (!token) return '';
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const language = info ? (info.split(/\s+/u, 1)[0] ?? '') : '';
  return renderCodeBlock(token.content, language, fenceIsClosed(token.map, env));
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
  ADD_ATTR: ['target', 'rel', MATH_ATTRIBUTE],
  ADD_URI_SAFE_ATTR: [MATH_ATTRIBUTE],
};

export const PATH_LINK_CLASS = 'path-link';
export const PATH_CANDIDATE_CLASS = 'path-candidate';

type EnhanceModule = typeof import('./enhance');

declare global {
  interface Window {
    agiRender?: (markdown: string) => string;
    agiEnhance?: (root: HTMLElement) => void;
    agiTakePendingPaths?: () => string[];
    agiResolvePaths?: (results: Record<string, boolean>) => void;
    DOMPurify?: typeof DOMPurify;
  }
}

const MAX_PENDING_PATHS = 200;
const pathExists = new Map<string, boolean>();
const pendingPaths = new Set<string>();

function setPathPosition(element: HTMLElement, reference: PathReference): void {
  element.dataset['path'] = reference.path;
  if (reference.line !== undefined) element.dataset['line'] = String(reference.line);
  if (reference.column !== undefined) element.dataset['column'] = String(reference.column);
}

function markAsLink(element: HTMLElement): void {
  element.className = PATH_LINK_CLASS;
  element.setAttribute('role', 'link');
  element.setAttribute('tabindex', '0');
}

function insideSkippedCode(parent: Element): boolean {
  if (parent.closest(`a, [${MATH_ATTRIBUTE}]`) !== null) return true;
  const code = parent.closest('pre code');
  return code !== null && /\blanguage-/u.test(code.className);
}

/**
 * Turn `src/app.ts:12:4` in already-sanitized model output into a span the
 * sidebar script can hand back to the extension host. The pass runs after
 * DOMPurify so nothing here widens what the sanitizer allowed. Code a model
 * labelled with a language is code, not a list of files, so it is skipped; any
 * other match only becomes a link once the host confirms the file exists.
 */
function linkifyPathReferences(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (parent === null || insideSkippedCode(parent)) continue;
    const references = findPathReferences(textNode.data).filter(
      (reference) => pathExists.get(reference.path) !== false,
    );
    if (references.length === 0) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const reference of references) {
      if (reference.start < cursor) continue;
      fragment.appendChild(document.createTextNode(textNode.data.slice(cursor, reference.start)));
      const span = document.createElement('span');
      setPathPosition(span, reference);
      if (pathExists.get(reference.path) === true) markAsLink(span);
      else {
        span.className = PATH_CANDIDATE_CLASS;
        if (pendingPaths.size < MAX_PENDING_PATHS) pendingPaths.add(reference.path);
      }
      const end = reference.start + reference.length;
      span.textContent = textNode.data.slice(reference.start, end);
      fragment.appendChild(span);
      cursor = end;
    }
    fragment.appendChild(document.createTextNode(textNode.data.slice(cursor)));
    textNode.replaceWith(fragment);
  }
}

function takePendingPaths(): string[] {
  const paths = [...pendingPaths].filter((path) => !pathExists.has(path));
  pendingPaths.clear();
  return paths;
}

function resolvePaths(results: Record<string, boolean>): void {
  for (const [path, exists] of Object.entries(results)) {
    if (typeof exists === 'boolean') pathExists.set(path, exists);
  }
  for (const candidate of document.querySelectorAll<HTMLElement>(`.${PATH_CANDIDATE_CLASS}`)) {
    const exists = pathExists.get(candidate.dataset['path'] ?? '');
    if (exists === true) markAsLink(candidate);
    else if (exists === false)
      candidate.replaceWith(document.createTextNode(candidate.textContent ?? ''));
  }
}

function render(markdown: string): string {
  if (typeof markdown !== 'string') return '';
  const source = normalizeMarkdownSource(markdown);
  const streamingFence = closeUnterminatedCodeFence(markdown) !== markdown;
  const env: RenderEnv = { openFenceEndLine: streamingFence ? source.split('\n').length : null };
  const html = md.render(source, env);
  const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG);
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  linkifyPathReferences(template.content);
  return template.innerHTML;
}

const enhanceSource =
  document.currentScript instanceof HTMLScriptElement
    ? (document.currentScript.dataset['enhanceSrc'] ?? null)
    : null;

let enhanceModule: EnhanceModule | null = null;
let enhanceLoad: Promise<EnhanceModule | null> | null = null;
const awaitingEnhance = new Set<HTMLElement>();

function loadEnhance(): Promise<EnhanceModule | null> {
  if (!enhanceSource) return Promise.resolve(null);
  enhanceLoad ??= (import(/* @vite-ignore */ enhanceSource) as Promise<EnhanceModule>).then(
    (module) => {
      enhanceModule = module;
      return module;
    },
    () => null,
  );
  return enhanceLoad;
}

function needsEnhancement(root: HTMLElement): boolean {
  return (
    root.querySelector(
      `[${MATH_ATTRIBUTE}], .${MERMAID_BLOCK_CLASS}, pre code[class*="language-"]`,
    ) !== null
  );
}

function enhance(root: HTMLElement): void {
  if (enhanceModule) {
    enhanceModule.enhance(root);
    return;
  }
  if (!needsEnhancement(root)) return;
  awaitingEnhance.add(root);
  void loadEnhance().then((module) => {
    if (!module) return;
    const roots = [...awaitingEnhance];
    awaitingEnhance.clear();
    for (const pending of roots) if (pending.isConnected) module.enhance(pending);
  });
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
window.agiEnhance = enhance;
window.agiTakePendingPaths = takePendingPaths;
window.agiResolvePaths = resolvePaths;
window.DOMPurify = DOMPurify;
