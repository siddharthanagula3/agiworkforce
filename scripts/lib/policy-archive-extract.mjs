const SKIP_TAGS = new Set([
  'NAV',
  'BUTTON',
  'FORM',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'SVG',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'IMG',
  'VIDEO',
  'AUDIO',
  'CANVAS',
]);

const BLOCK_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'UL',
  'OL',
  'DL',
  'TABLE',
  'DIV',
  'SECTION',
  'ARTICLE',
  'ASIDE',
  'HEADER',
  'FOOTER',
  'MAIN',
  'FIGURE',
  'BLOCKQUOTE',
]);

const ACTION_CLASS = /\bagi-ds-btn(-row)?\b/;
const LINK_ROW_CLASS = /(^|\s)agi-ds-btn-row(\s|$)/;
const CONCEALED = '[aria-hidden="true"], [hidden]';
const PAGE_HERO = '.agi-ds-hero';

function classOf(element) {
  return element.getAttribute('class') ?? '';
}

function concealed(element) {
  return element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('hidden');
}

function skipped(element) {
  return (
    SKIP_TAGS.has(element.tagName) || concealed(element) || ACTION_CLASS.test(classOf(element))
  );
}

function sentenceControl(element) {
  return (
    element.tagName === 'BUTTON' && !concealed(element) && !ACTION_CLASS.test(classOf(element))
  );
}

export function plain(segments) {
  return segments.map((segment) => segment.text).join('');
}

function inline(node, style, out, controls) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const text = (child.textContent ?? '').replace(/\s+/g, ' ');
      if (text) out.push({ text, ...style });
      continue;
    }
    if (child.nodeType !== 1) continue;
    if (controls && sentenceControl(child)) {
      const label = plain(inline(child, {}, [], false));
      if (label.trim()) out.push({ text: label });
      continue;
    }
    if (skipped(child)) continue;
    const tag = child.tagName;
    if (tag === 'BR') out.push({ text: '\n' });
    else if (tag === 'A') {
      const href = child.getAttribute('href');
      inline(child, href ? { ...style, href } : style, out, controls);
    } else if (tag === 'STRONG' || tag === 'B') {
      inline(child, { ...style, strong: true }, out, controls);
    } else if (tag === 'EM' || tag === 'I') inline(child, { ...style, em: true }, out, controls);
    else if (tag === 'CODE') inline(child, { ...style, code: true }, out, controls);
    else inline(child, style, out, controls);
  }
  return out;
}

function sameStyle(left, right) {
  return (
    left.href === right.href &&
    left.strong === right.strong &&
    left.em === right.em &&
    left.code === right.code
  );
}

function hasProse(node) {
  return inline(node, {}, [], false).some((segment) => segment.text.trim().length > 0);
}

function content(node) {
  const merged = [];
  for (const segment of inline(node, {}, [], hasProse(node))) {
    const last = merged.at(-1);
    if (last && sameStyle(last, segment) && segment.text !== '\n' && last.text !== '\n') {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  for (const segment of merged) {
    if (segment.text !== '\n') segment.text = segment.text.replace(/ {2,}/g, ' ');
  }
  const first = merged[0];
  if (first && first.text !== '\n') first.text = first.text.replace(/^ +/, '');
  const last = merged.at(-1);
  if (last && last.text !== '\n') last.text = last.text.replace(/ +$/, '');
  return merged.filter((segment) => segment.text.length > 0);
}

function linkRowItems(element) {
  if (!LINK_ROW_CLASS.test(classOf(element)) || concealed(element)) return [];
  if (element.closest(PAGE_HERO)) return [];
  return Array.from(element.querySelectorAll('a[href]'))
    .filter((link) => !link.closest(CONCEALED))
    .map((link) => ({ text: plain(content(link)), href: link.getAttribute('href') }))
    .filter((link) => link.text.length > 0 && link.href)
    .map((link) => [link]);
}

function hasBlockChild(element) {
  return Array.from(element.children).some(
    (child) =>
      linkRowItems(child).length > 0 ||
      (!skipped(child) && (BLOCK_TAGS.has(child.tagName) || hasBlockChild(child))),
  );
}

export function extract(root) {
  const blocks = [];
  let anchor;
  const paragraph = (node) => {
    const segments = content(node);
    if (segments.length > 0) blocks.push({ type: 'paragraph', content: segments });
  };
  const walk = (element) => {
    for (const child of Array.from(element.children)) {
      const links = linkRowItems(child);
      if (links.length > 0) {
        blocks.push({ type: 'list', items: links });
        continue;
      }
      if (skipped(child)) continue;
      const tag = child.tagName;
      const id = child.getAttribute('id');
      if (id && /^(SECTION|DIV|ARTICLE)$/.test(tag)) anchor = id;
      const className = classOf(child);
      if (/^H[1-6]$/.test(tag)) {
        const segments = content(child);
        const headingAnchor = anchor ?? id ?? undefined;
        anchor = undefined;
        if (segments.length === 0) continue;
        blocks.push({
          type: 'heading',
          level: Number(tag.slice(1)),
          ...(headingAnchor ? { anchor: headingAnchor } : {}),
          content: segments,
        });
      } else if (tag === 'P') {
        paragraph(child);
      } else if ((tag === 'UL' || tag === 'OL') && /\bagi-ds-ledger\b/.test(className)) {
        const rows = Array.from(child.querySelectorAll(':scope > li')).map((row) => ({
          label: content(row.querySelector('.agi-ds-ledger-label') ?? row),
          value: content(row.querySelector('.agi-ds-ledger-value') ?? row),
        }));
        const caption = child.getAttribute('aria-label');
        blocks.push(caption ? { type: 'rows', caption, rows } : { type: 'rows', rows });
      } else if (tag === 'UL' || tag === 'OL') {
        const items = Array.from(child.querySelectorAll(':scope > li'))
          .map((item) => content(item))
          .filter((item) => item.length > 0);
        if (items.length > 0) blocks.push({ type: 'list', items });
      } else if (tag === 'DL') {
        const rows = Array.from(child.querySelectorAll('dt')).map((term) => ({
          label: content(term),
          value: content(term.nextElementSibling ?? term),
        }));
        blocks.push({ type: 'rows', rows });
      } else if (tag === 'TABLE') {
        const cells = Array.from(child.querySelectorAll('tr')).map((row) =>
          Array.from(row.querySelectorAll('th, td')).map((cell) => content(cell)),
        );
        const header = (cells[0] ?? []).map(plain);
        blocks.push({
          type: 'table',
          header,
          rows: cells.slice(1),
        });
      } else if (/\bagi-ds-eyebrow\b/.test(className)) {
        const segments = content(child);
        if (segments.length > 0) blocks.push({ type: 'eyebrow', content: segments });
      } else if (hasBlockChild(child)) {
        walk(child);
      } else {
        paragraph(child);
      }
    }
  };
  walk(root);
  return blocks;
}
