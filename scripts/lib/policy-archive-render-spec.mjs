import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
  notFound: () => {},
}));

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

function skipped(element) {
  if (SKIP_TAGS.has(element.tagName)) return true;
  if (element.getAttribute('aria-hidden') === 'true') return true;
  if (element.hasAttribute('hidden')) return true;
  return /\bagi-ds-btn(-row)?\b/.test(element.getAttribute('class') ?? '');
}

function inline(node, style, out) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const text = (child.textContent ?? '').replace(/\s+/g, ' ');
      if (text) out.push({ text, ...style });
      continue;
    }
    if (child.nodeType !== 1 || skipped(child)) continue;
    const tag = child.tagName;
    if (tag === 'BR') out.push({ text: '\n' });
    else if (tag === 'A') {
      const href = child.getAttribute('href');
      inline(child, href ? { ...style, href } : style, out);
    } else if (tag === 'STRONG' || tag === 'B') inline(child, { ...style, strong: true }, out);
    else if (tag === 'EM' || tag === 'I') inline(child, { ...style, em: true }, out);
    else if (tag === 'CODE') inline(child, { ...style, code: true }, out);
    else inline(child, style, out);
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

function content(node) {
  const merged = [];
  for (const segment of inline(node, {}, [])) {
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

function hasBlockChild(element) {
  return Array.from(element.children).some(
    (child) => !skipped(child) && (BLOCK_TAGS.has(child.tagName) || hasBlockChild(child)),
  );
}

function plain(segments) {
  return segments.map((segment) => segment.text).join('');
}

function extract(root) {
  const blocks = [];
  let anchor;
  const paragraph = (node) => {
    const segments = content(node);
    if (segments.length > 0) blocks.push({ type: 'paragraph', content: segments });
  };
  const walk = (element) => {
    for (const child of Array.from(element.children)) {
      if (skipped(child)) continue;
      const tag = child.tagName;
      const id = child.getAttribute('id');
      if (id && /^(SECTION|DIV|ARTICLE)$/.test(tag)) anchor = id;
      const className = child.getAttribute('class') ?? '';
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

const TARGETS = JSON.parse(process.env['POLICY_ARCHIVE_TARGETS'] ?? '[]');

it('renders each replaced policy version', async () => {
  for (const target of TARGETS) {
    const loaded = await import(
      /* @vite-ignore */ path.join(process.cwd(), target.page.replace(/^apps\/web\//, ''))
    );
    const Page = loaded.default;
    const props = { params: Promise.resolve({}), searchParams: Promise.resolve({}) };
    const element =
      Page.constructor.name === 'AsyncFunction' ? await Page(props) : createElement(Page, props);
    const { container } = render(
      createElement(QueryClientProvider, { client: new QueryClient() }, element),
    );
    const blocks = extract(container.querySelector('main') ?? container);
    const heading = blocks.find((block) => block.type === 'heading' && block.level === 1);
    writeFileSync(
      target.out,
      `${JSON.stringify(
        {
          key: target.key,
          route: target.route,
          date: target.date,
          replacedOn: target.replacedOn,
          commit: target.commit,
          committedAt: target.committedAt,
          title: heading ? plain(heading.content).trim() : target.route,
          blocks,
        },
        null,
        2,
      )}\n`,
    );
    cleanup();
  }
}, 300_000);
