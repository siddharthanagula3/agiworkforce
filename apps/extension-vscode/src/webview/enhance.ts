import katex from 'katex';
import type { MermaidConfig } from 'mermaid';
import {
  highlightToLines,
  readHighlightCache,
  resolveHighlightLanguage,
  type HighlightedLine,
} from '@agiworkforce/unified-chat/shiki-highlighter';
import { MATH_ATTRIBUTE } from './math';

const MERMAID_BLOCK = '.code-block-wrapper--mermaid.code-block-wrapper--closed';
const DIAGRAM_CLASS = 'mermaid-diagram';
const DIAGRAM_TOGGLE_CLASS = 'mermaid-diagram__toggle';
const SKIPPED_HIGHLIGHT_LANGUAGES = new Set(['diff', 'patch', 'mermaid']);
const SVG_TYPE = 'image/svg+xml';
const DIAGRAM_CACHE_LIMIT = 32;

interface DiagramStrings {
  diagram: string;
  showSource: string;
  hideSource: string;
}

function strings(): DiagramStrings {
  const l10n = (window as unknown as { L10N?: Partial<Record<string, unknown>> }).L10N ?? {};
  const read = (key: string, fallback: string): string => {
    const value = l10n[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  return {
    diagram: read('diagram', 'Diagram'),
    showSource: read('showDiagramSource', 'Show source'),
    hideSource: read('hideDiagramSource', 'Hide source'),
  };
}

function renderMath(root: HTMLElement): void {
  for (const node of root.querySelectorAll<HTMLElement>(`[${MATH_ATTRIBUTE}]`)) {
    if (node.dataset['mathSource'] !== undefined) continue;
    const source = node.textContent ?? '';
    node.dataset['mathSource'] = source;
    katex.render(source, node, {
      displayMode: node.getAttribute(MATH_ATTRIBUTE) === 'display',
      throwOnError: false,
      errorColor: 'var(--vscode-errorForeground)',
      output: 'htmlAndMathml',
    });
  }
}

function toCssProperty(property: string): string {
  return property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function paintHighlightedLines(code: HTMLElement, lines: readonly HighlightedLine[]): void {
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createTextNode('\n'));
    for (const token of line) {
      const span = document.createElement('span');
      span.className = 'shiki-token';
      span.textContent = token.content;
      for (const [property, value] of Object.entries(token.style)) {
        if (typeof value === 'string') span.style.setProperty(toCssProperty(property), value);
      }
      fragment.appendChild(span);
    }
  });
  code.replaceChildren(fragment);
  code.dataset['highlighted'] = 'true';
}

function codeLanguage(code: HTMLElement): string | null {
  const match = /\blanguage-([^\s]+)/u.exec(code.className);
  const language = match?.[1]?.toLowerCase() ?? null;
  if (!language || SKIPPED_HIGHLIGHT_LANGUAGES.has(language)) return null;
  return resolveHighlightLanguage(language) ? language : null;
}

function highlightCode(root: HTMLElement): void {
  for (const code of root.querySelectorAll<HTMLElement>('pre code[class*="language-"]')) {
    if (code.dataset['highlighted'] === 'true') continue;
    const language = codeLanguage(code);
    if (!language) continue;
    const source = code.textContent ?? '';
    const cached = readHighlightCache(source, language);
    if (cached) {
      paintHighlightedLines(code, cached);
      continue;
    }
    void highlightToLines(source, language)
      .then((lines) => {
        if (lines && code.isConnected && code.dataset['highlighted'] !== 'true') {
          if (code.textContent === source) paintHighlightedLines(code, lines);
        }
      })
      .catch(() => undefined);
  }
}

type DiagramResult = { url: string } | { failed: true };

const diagramCache = new Map<string, DiagramResult>();
const diagramPending = new Map<string, Promise<DiagramResult>>();
let mermaidLoad: Promise<(typeof import('mermaid'))['default']> | null = null;
let mermaidTheme: string | null = null;
let diagramSequence = 0;

function isDarkTheme(): boolean {
  const classes = document.body.classList;
  return (
    classes.contains('vscode-dark') ||
    (classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light'))
  );
}

function mermaidConfig(theme: 'dark' | 'default'): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    htmlLabels: false,
    fontFamily: getComputedStyle(document.body).fontFamily,
    flowchart: { htmlLabels: false, useMaxWidth: false },
    class: { htmlLabels: false },
    suppressErrorRendering: true,
  };
}

async function loadMermaid(
  theme: 'dark' | 'default',
): Promise<(typeof import('mermaid'))['default']> {
  mermaidLoad ??= import('mermaid').then((module) => module.default);
  const mermaid = await mermaidLoad;
  if (mermaidTheme !== theme) {
    mermaid.initialize(mermaidConfig(theme));
    mermaidTheme = theme;
  }
  return mermaid;
}

function standaloneSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, SVG_TYPE);
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new Error('invalid svg');
  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  const width = viewBox[2];
  const height = viewBox[3];
  if (
    viewBox.length === 4 &&
    width !== undefined &&
    height !== undefined &&
    width > 0 &&
    height > 0
  ) {
    root.setAttribute('width', String(Math.ceil(width)));
    root.setAttribute('height', String(Math.ceil(height)));
  }
  root.removeAttribute('style');
  return new XMLSerializer().serializeToString(root);
}

function remember(key: string, result: DiagramResult): void {
  diagramCache.delete(key);
  diagramCache.set(key, result);
  while (diagramCache.size > DIAGRAM_CACHE_LIMIT) {
    const oldest = diagramCache.keys().next();
    if (oldest.done) break;
    const evicted = diagramCache.get(oldest.value);
    if (evicted && 'url' in evicted) URL.revokeObjectURL(evicted.url);
    diagramCache.delete(oldest.value);
  }
}

function renderDiagram(source: string, theme: 'dark' | 'default'): Promise<DiagramResult> {
  const key = `${theme}\u0000${source}`;
  const cached = diagramCache.get(key);
  if (cached) return Promise.resolve(cached);
  let pending = diagramPending.get(key);
  if (pending) return pending;
  pending = (async (): Promise<DiagramResult> => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.className = 'mermaid-render-host';
    document.body.append(host);
    try {
      const mermaid = await loadMermaid(theme);
      diagramSequence += 1;
      const { svg } = await mermaid.render(`agi-mermaid-${diagramSequence}`, source, host);
      const url = URL.createObjectURL(new Blob([standaloneSvg(svg)], { type: SVG_TYPE }));
      return { url };
    } catch {
      return { failed: true };
    } finally {
      host.remove();
    }
  })().then((result) => {
    diagramPending.delete(key);
    remember(key, result);
    return result;
  });
  diagramPending.set(key, pending);
  return pending;
}

function showDiagram(block: HTMLElement, url: string): void {
  const previous = block.previousElementSibling;
  if (previous instanceof HTMLElement && previous.classList.contains(DIAGRAM_CLASS))
    previous.remove();
  const text = strings();
  const figure = document.createElement('figure');
  figure.className = DIAGRAM_CLASS;
  const image = document.createElement('img');
  image.src = url;
  image.alt = text.diagram;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = DIAGRAM_TOGGLE_CLASS;
  toggle.textContent = text.showSource;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const showing = block.hidden;
    block.hidden = !showing;
    toggle.textContent = showing ? text.hideSource : text.showSource;
    toggle.setAttribute('aria-expanded', String(showing));
  });
  figure.append(image, toggle);
  block.before(figure);
  block.hidden = true;
  block.dataset['diagram'] = url;
}

function renderDiagrams(root: ParentNode): void {
  const theme = isDarkTheme() ? 'dark' : 'default';
  for (const block of root.querySelectorAll<HTMLElement>(MERMAID_BLOCK)) {
    const source = block.querySelector('pre code')?.textContent ?? '';
    if (!source.trim()) continue;
    const key = `${theme}\u0000${source}`;
    const cached = diagramCache.get(key);
    if (cached) {
      if ('url' in cached && block.dataset['diagram'] !== cached.url)
        showDiagram(block, cached.url);
      continue;
    }
    void renderDiagram(source, theme).then((result) => {
      if ('url' in result && block.isConnected) showDiagram(block, result.url);
    });
  }
}

let themeObserver: MutationObserver | null = null;

function watchTheme(): void {
  if (themeObserver) return;
  let dark = isDarkTheme();
  themeObserver = new MutationObserver(() => {
    const next = isDarkTheme();
    if (next === dark) return;
    dark = next;
    renderDiagrams(document);
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

export function enhance(root: HTMLElement): void {
  renderMath(root);
  highlightCode(root);
  renderDiagrams(root);
  watchTheme();
}
