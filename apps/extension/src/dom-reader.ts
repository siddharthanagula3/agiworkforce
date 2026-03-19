import {
  SmartDOMReader,
  ContentDetection,
  SelectorGenerator,
  ProgressiveExtractor,
} from '@mcp-b/smart-dom-reader';
import type { ExtractedElement, SmartDOMResult, ExtractedContent } from '@mcp-b/smart-dom-reader';
import { logger } from './utils';

export interface DomSnapshot {
  title: string;
  url: string;
  mainContent: string;
  headings: Array<{ level: number; text: string }>;
  links: Array<{ text: string; href: string }>;
  forms: Array<{ name: string; action: string; fields: string[] }>;
  images: Array<{ alt: string; src: string }>;
  tables: Array<{ headers: string[]; rowCount: number }>;
  interactiveElements: Array<{
    tag: string;
    type?: string;
    name?: string;
    label?: string;
    selector: string;
  }>;
  tokenEstimate: number;
}

/** Tags whose content should be stripped entirely before text extraction. */
const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME']);

function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return true;

  try {
    const style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  } catch {
    return false;
  }
}

function collectText(node: Node, maxChars: number): string {
  const parts: string[] = [];
  let charCount = 0;

  function walk(n: Node): void {
    if (charCount >= maxChars) return;

    if (n.nodeType === Node.TEXT_NODE) {
      const text = (n.textContent ?? '').trim();
      if (text.length > 0) {
        const remaining = maxChars - charCount;
        const chunk = text.length > remaining ? text.slice(0, remaining) : text;
        parts.push(chunk);
        charCount += chunk.length;
      }
      return;
    }

    if (n.nodeType !== Node.ELEMENT_NODE) return;

    const el = n as Element;
    if (STRIP_TAGS.has(el.tagName)) return;
    if (isHidden(el)) return;

    // Insert newlines around block-level elements for readability
    const blockTags = new Set([
      'P',
      'DIV',
      'SECTION',
      'ARTICLE',
      'MAIN',
      'HEADER',
      'FOOTER',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'LI',
      'TR',
      'BLOCKQUOTE',
      'PRE',
      'FIGCAPTION',
      'DT',
      'DD',
    ]);
    const isBlock = blockTags.has(el.tagName);
    if (isBlock && parts.length > 0) parts.push('\n');

    for (const child of Array.from(n.childNodes)) {
      if (charCount >= maxChars) break;
      walk(child);
    }

    if (isBlock) parts.push('\n');
  }

  walk(node);

  // Normalise whitespace: collapse runs of blanks / newlines, trim
  return parts
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cssSelector(el: Element): string {
  try {
    const sel = SelectorGenerator.generateSelectors(el);
    if (sel.css) return sel.css;
  } catch {
    // SelectorGenerator may throw on detached nodes
  }

  // Fallback: build a minimal tag-based path
  const tag = el.tagName.toLowerCase();
  const id = el.id;
  if (id) return `#${CSS.escape(id)}`;
  return tag;
}

function findMainContentRoot(): Element {
  try {
    return ContentDetection.findMainContent(document);
  } catch {
    // Fallback chain
    const candidates = [
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('article'),
      document.querySelector('#content'),
      document.querySelector('.content'),
    ];
    for (const c of candidates) {
      if (c) return c;
    }
    return document.body;
  }
}

function extractHeadingsFromResult(result: SmartDOMResult): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];

  if (result.semantic?.headings) {
    for (const h of result.semantic.headings) {
      const tag = h.tag.toUpperCase();
      const match = /^H(\d)$/.exec(tag);
      const level = match ? parseInt(match[1] as string, 10) : 0;
      if (level >= 1 && level <= 6 && h.text.trim()) {
        headings.push({ level, text: h.text.trim() });
      }
    }
  }

  return headings;
}

function extractHeadingsFromDom(): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

  els.forEach((el) => {
    if (isHidden(el)) return;
    const match = /^H(\d)$/i.exec(el.tagName);
    if (!match) return;
    const level = parseInt(match[1] as string, 10);
    const text = el.textContent?.trim() ?? '';
    if (text) headings.push({ level, text });
  });

  return headings;
}

function extractLinks(result: SmartDOMResult): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const seen = new Set<string>();

  for (const link of result.interactive.links) {
    const href = link.attributes['href'] ?? '';
    const text = link.text.trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    links.push({ text: text || href, href });
  }

  return links;
}

function extractForms(
  result: SmartDOMResult,
): Array<{ name: string; action: string; fields: string[] }> {
  return result.interactive.forms.map((f) => {
    const fields = f.inputs.map((input: ExtractedElement) => {
      const name = input.attributes['name'] ?? input.attributes['id'] ?? input.tag;
      const type = input.attributes['type'] ?? 'text';
      return `${name}(${type})`;
    });
    return {
      name: f.selector,
      action: f.action ?? '',
      fields,
    };
  });
}

function extractImages(result: SmartDOMResult): Array<{ alt: string; src: string }> {
  const images: Array<{ alt: string; src: string }> = [];

  if (result.semantic?.images) {
    for (const img of result.semantic.images) {
      const alt = img.attributes['alt'] ?? '';
      const src = img.attributes['src'] ?? '';
      if (src) images.push({ alt, src });
    }
  }

  return images;
}

function extractTables(result: SmartDOMResult): Array<{ headers: string[]; rowCount: number }> {
  const tables: Array<{ headers: string[]; rowCount: number }> = [];

  if (result.semantic?.tables) {
    for (const table of result.semantic.tables) {
      // The SmartDOMReader gives us the table element info but not parsed rows.
      // Use the selector to query the actual DOM for header/row counts.
      try {
        const tableEl = document.querySelector(table.selector.css);
        if (!tableEl) continue;

        const headerCells = tableEl.querySelectorAll('th');
        const headers = Array.from(headerCells).map((th) => th.textContent?.trim() ?? '');
        const rowCount = tableEl.querySelectorAll('tr').length;

        tables.push({ headers, rowCount });
      } catch {
        // Selector may be invalid for this table
        tables.push({ headers: [], rowCount: 0 });
      }
    }
  }

  return tables;
}

function extractInteractive(result: SmartDOMResult): Array<{
  tag: string;
  type?: string;
  name?: string;
  label?: string;
  selector: string;
}> {
  const elements: Array<{
    tag: string;
    type?: string;
    name?: string;
    label?: string;
    selector: string;
  }> = [];

  const seen = new Set<string>();

  function addElement(extracted: ExtractedElement): void {
    const sel = extracted.selector.css;
    if (!sel || seen.has(sel)) return;
    seen.add(sel);

    const type = extracted.attributes['type'] || undefined;
    const name = extracted.attributes['name'] || undefined;

    // Determine label
    let elLabel: string | undefined;
    const ariaLabel = extracted.attributes['aria-label'];
    if (ariaLabel) {
      elLabel = ariaLabel;
    } else if (extracted.text.trim()) {
      elLabel = extracted.text.trim().slice(0, 80);
    } else {
      const placeholder = extracted.attributes['placeholder'];
      const title = extracted.attributes['title'];
      elLabel = placeholder || title || undefined;
    }

    elements.push({
      tag: extracted.tag,
      type,
      name,
      label: elLabel,
      selector: sel,
    });
  }

  for (const btn of result.interactive.buttons) addElement(btn);
  for (const input of result.interactive.inputs) addElement(input);
  for (const clickable of result.interactive.clickable) addElement(clickable);

  return elements;
}

function extractMainContentText(maxChars: number): string {
  const mainRoot = findMainContentRoot();

  // Try ProgressiveExtractor.extractContent for structured content
  try {
    const sel = cssSelector(mainRoot);
    const content: ExtractedContent | null = ProgressiveExtractor.extractContent(sel, document, {
      includeHeadings: true,
      includeLists: true,
      includeTables: false,
      maxTextLength: maxChars,
    });

    if (content) {
      const parts: string[] = [];

      // Add headings
      if (content.text.headings) {
        for (const h of content.text.headings) {
          const prefix = '#'.repeat(h.level);
          parts.push(`${prefix} ${h.text}`);
        }
      }

      // Add paragraphs
      if (content.text.paragraphs) {
        for (const p of content.text.paragraphs) {
          parts.push(p);
        }
      }

      // Add lists
      if (content.text.lists) {
        for (const list of content.text.lists) {
          for (const item of list.items) {
            parts.push(`- ${item}`);
          }
        }
      }

      const text = parts.join('\n').trim();
      if (text.length > 0) {
        return text.length > maxChars ? text.slice(0, maxChars) : text;
      }
    }
  } catch (e) {
    logger.debug('ProgressiveExtractor.extractContent failed, using fallback', e);
  }

  // Fallback: manual text collection
  return collectText(mainRoot, maxChars);
}

export function extractDomSnapshot(maxChars: number = 10000): DomSnapshot {
  logger.debug('Extracting DOM snapshot', { maxChars });

  // Run SmartDOMReader in full mode to get interactive + semantic elements
  let result: SmartDOMResult;
  try {
    result = SmartDOMReader.extractFull(document, {
      includeHidden: false,
      viewportOnly: false,
    });
  } catch (e) {
    logger.error('SmartDOMReader.extractFull failed', e);
    // Return a minimal snapshot on failure
    return {
      title: document.title,
      url: window.location.href,
      mainContent: collectText(document.body, maxChars),
      headings: extractHeadingsFromDom(),
      links: [],
      forms: [],
      images: [],
      tables: [],
      interactiveElements: [],
      tokenEstimate: 0,
    };
  }

  const title = document.title;
  const url = window.location.href;
  const mainContent = extractMainContentText(maxChars);
  const headings =
    extractHeadingsFromResult(result).length > 0
      ? extractHeadingsFromResult(result)
      : extractHeadingsFromDom();
  const links = extractLinks(result);
  const forms = extractForms(result);
  const images = extractImages(result);
  const tables = extractTables(result);
  const interactiveElements = extractInteractive(result);

  // Calculate total character count across all fields for token estimation
  let totalChars = title.length + url.length + mainContent.length;
  for (const h of headings) totalChars += h.text.length;
  for (const l of links) totalChars += l.text.length + l.href.length;
  for (const f of forms) {
    totalChars += f.name.length + f.action.length;
    for (const field of f.fields) totalChars += field.length;
  }
  for (const img of images) totalChars += img.alt.length + img.src.length;
  for (const t of tables) {
    for (const h of t.headers) totalChars += h.length;
  }
  for (const ie of interactiveElements) {
    totalChars +=
      ie.tag.length +
      (ie.type?.length ?? 0) +
      (ie.name?.length ?? 0) +
      (ie.label?.length ?? 0) +
      ie.selector.length;
  }

  const tokenEstimate = Math.ceil(totalChars / 4);

  const snapshot: DomSnapshot = {
    title,
    url,
    mainContent,
    headings,
    links,
    forms,
    images,
    tables,
    interactiveElements,
    tokenEstimate,
  };

  logger.debug('DOM snapshot extracted', {
    headings: headings.length,
    links: links.length,
    forms: forms.length,
    images: images.length,
    tables: tables.length,
    interactive: interactiveElements.length,
    tokenEstimate,
  });

  return snapshot;
}
