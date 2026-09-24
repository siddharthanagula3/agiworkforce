import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { INVENTORY_PATH, checkRawHtmlSinks } from './check-raw-html-sinks.mjs';
import { classifySinks, findSinks, isStaticMarkup, outermostCall } from './lib/raw-html-sinks.mjs';

const PURIFYING_MODULE = `
import DOMPurify from 'dompurify';
export function cleanHtml(dirty) {
  return DOMPurify.sanitize(dirty);
}
`;

const PASS_THROUGH_MODULE = `
export function cleanHtml(dirty) {
  return dirty;
}
`;

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-html-sinks-'));
  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

function inventory(entries, structuralSanitizers = []) {
  return JSON.stringify({ structuralSanitizers, sinks: entries });
}

test('model text handed to dangerouslySetInnerHTML with no sanitizer fails', () => {
  const root = fixture({
    'apps/web/features/chat/Bubble.tsx': `
export function Bubble({ text }) {
  return <div dangerouslySetInnerHTML={{ __html: text }} />;
}
`,
  });
  const { failures } = checkRawHtmlSinks(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /Bubble\.tsx:3 hands markup to the DOM \(dangerously-set-inner-html\)/);
});

test('a sanitizer that resolves through the import to DOMPurify passes', () => {
  const root = fixture({
    'apps/web/shared/clean.ts': PURIFYING_MODULE,
    'apps/web/features/chat/Bubble.tsx': `
import { cleanHtml } from '../../shared/clean';
export function Bubble({ text }) {
  const safe = useMemo(() => cleanHtml(text), [text]);
  return <div dangerouslySetInnerHTML={{ __html: safe }} />;
}
`,
  });
  assert.deepEqual(checkRawHtmlSinks(root).failures, []);
});

test('a function named like a sanitizer that does not sanitize is not one', () => {
  const root = fixture({
    'apps/web/shared/clean.ts': PASS_THROUGH_MODULE,
    'apps/web/features/chat/Bubble.tsx': `
import { cleanHtml } from '../../shared/clean';
export function Bubble({ text }) {
  return <div dangerouslySetInnerHTML={{ __html: cleanHtml(text) }} />;
}
`,
  });
  assert.equal(checkRawHtmlSinks(root).failures.length, 1);
});

test('a sanitizer wrapped around only part of the value does not cover the rest', () => {
  const root = fixture({
    'apps/web/shared/clean.ts': PURIFYING_MODULE,
    'apps/extension/src/panel.ts': `
import { cleanHtml } from '../../web/shared/clean';
export function paint(node, text, trailer) {
  node.innerHTML = cleanHtml(text) + trailer;
}
`,
  });
  assert.equal(checkRawHtmlSinks(root).failures.length, 1);
});

test('an alias import resolves through the nearest tsconfig paths', () => {
  const root = fixture({
    'apps/desktop/tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
    'apps/desktop/src/utils/clean.ts': PURIFYING_MODULE,
    'apps/desktop/src/features/Preview.tsx': `
import { cleanHtml } from '@/utils/clean';
export function Preview({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: cleanHtml(html) }} />;
}
`,
  });
  assert.deepEqual(checkRawHtmlSinks(root).failures, []);
});

test('literal markup, and a constant imported from a module that holds a literal, pass', () => {
  const root = fixture({
    'apps/web/shared/script.ts':
      'export const BOOT = `document.documentElement.dataset.ready = "1"`;\n',
    'apps/web/app/layout.tsx': `
import { BOOT } from '../shared/script';
export function Layout() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
`,
    'apps/extension/src/icon.ts': `
export function paint(node) {
  node.innerHTML =
    '<svg viewBox="0 0 24 24">' + '<path d="M0 0"/></svg>';
}
`,
  });
  assert.deepEqual(checkRawHtmlSinks(root).failures, []);
});

test('srcDoc passes only inside a frame whose sandbox cannot reach the page', () => {
  const contained = fixture({
    'apps/web/features/Thumb.tsx': `
const POLICY = 'allow-scripts';
export function Thumb({ html }) {
  return <iframe title="t" sandbox={POLICY} srcDoc={html} />;
}
`,
  });
  assert.deepEqual(checkRawHtmlSinks(contained).failures, []);

  const escaping = fixture({
    'apps/web/features/Thumb.tsx': `
export function Thumb({ html }) {
  return <iframe title="t" sandbox="allow-scripts allow-same-origin" srcDoc={html} />;
}
`,
  });
  assert.equal(checkRawHtmlSinks(escaping).failures.length, 1);

  const bare = fixture({
    'apps/web/features/Thumb.tsx': `
export function Thumb({ html }) {
  return <iframe title="t" srcDoc={html} />;
}
`,
  });
  assert.equal(checkRawHtmlSinks(bare).failures.length, 1);
});

test('rehype-raw passes only when rehype-sanitize follows it in the same plugin list', () => {
  const ordered = fixture({
    'packages/ui/chat/src/Markdown.tsx': `
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
const PLUGINS = [rehypeRaw, [rehypeSanitize, SCHEMA]];
`,
  });
  assert.deepEqual(checkRawHtmlSinks(ordered).failures, []);

  const unsanitized = fixture({
    'packages/ui/chat/src/Markdown.tsx': `
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
const PLUGINS = [rehypeRaw];
const OTHER = [rehypeSanitize];
`,
  });
  assert.equal(checkRawHtmlSinks(unsanitized).failures.length, 1);
});

test('an inventoried sink passes, a new one in the same file fails, and a shrunk count must be lowered', () => {
  const single = `
export function paint(node, html) {
  node.innerHTML = html;
}
`;
  const entry = {
    file: 'apps/extension/src/panel.ts',
    kind: 'inner-html-assignment',
    count: 1,
    reason:
      'The value is built by the caller from fixed markup; the fixture only needs a reason long enough.',
  };
  const root = fixture({
    'apps/extension/src/panel.ts': single,
    [INVENTORY_PATH]: inventory([entry]),
  });
  assert.deepEqual(checkRawHtmlSinks(root).failures, []);

  fs.writeFileSync(
    path.join(root, 'apps/extension/src/panel.ts'),
    `${single}\nexport function more(node, html) {\n  node.innerHTML = html;\n}\n`,
  );
  assert.match(checkRawHtmlSinks(root).failures.join('\n'), /has 2 inner-html-assignment sinks/);

  fs.writeFileSync(path.join(root, 'apps/extension/src/panel.ts'), 'export const nothing = 1;\n');
  assert.match(checkRawHtmlSinks(root).failures.join('\n'), /lower the count/);
});

test('an inventory entry without a reason fails', () => {
  const root = fixture({
    'apps/extension/src/panel.ts':
      'export function paint(node, html) {\n  node.innerHTML = html;\n}\n',
    [INVENTORY_PATH]: inventory([
      {
        file: 'apps/extension/src/panel.ts',
        kind: 'inner-html-assignment',
        count: 1,
        reason: 'ok',
      },
    ]),
  });
  assert.match(checkRawHtmlSinks(root).failures.join('\n'), /carries no reason/);
});

test('a structural sanitizer counts only while its behavioural test exists and exercises it', () => {
  const files = {
    'packages/ui/chat/src/svg.ts': 'export function cleanSvg(raw) {\n  return raw;\n}\n',
    'packages/ui/chat/src/View.tsx': `
import { cleanSvg } from './svg';
export function View({ svg }) {
  return <div dangerouslySetInnerHTML={{ __html: cleanSvg(svg) }} />;
}
`,
    [INVENTORY_PATH]: inventory(
      [],
      [
        {
          name: 'cleanSvg',
          module: 'packages/ui/chat/src/svg.ts',
          test: 'packages/ui/chat/src/svg.test.ts',
        },
      ],
    ),
  };
  const withoutTest = fixture(files);
  assert.equal(checkRawHtmlSinks(withoutTest).failures.length, 2);

  const withTest = fixture({
    ...files,
    'packages/ui/chat/src/svg.test.ts': "expect(cleanSvg('<svg/>')).toBe('<svg/>');\n",
  });
  assert.deepEqual(checkRawHtmlSinks(withTest).failures, []);
});

test('a markup object passed by reference or through createElement is still a sink', () => {
  const root = fixture({
    'apps/web/features/chat/ByReference.tsx': `
export function ByReference({ markup }) {
  return <div dangerouslySetInnerHTML={markup} />;
}
`,
    'packages/ui/chat/src/Created.ts': `
export const created = (html) => createElement('div', { dangerouslySetInnerHTML: { __html: html } });
`,
    'packages/ui/chat/src/Clean.ts': `
import DOMPurify from 'dompurify';
export const clean = (html) => createElement('div', { dangerouslySetInnerHTML: { __html: DOMPurify.sanitize(html) } });
`,
  });
  const { failures } = checkRawHtmlSinks(root);
  assert.equal(failures.length, 2);
  assert.match(failures.join('\n'), /ByReference\.tsx:3/);
  assert.match(failures.join('\n'), /Created\.ts:2/);
});

test('sinks named in comments are prose, not sinks', () => {
  assert.deepEqual(findSinks('// the old code set node.innerHTML = html here\nconst x = 1;\n'), []);
});

test('the expression helpers read whole expressions', () => {
  assert.equal(isStaticMarkup('\'<a>\' + "<b>"'), true);
  assert.equal(isStaticMarkup('`<a>${name}</a>`'), false);
  assert.equal(outermostCall('clean(render(text))'), 'clean');
  assert.equal(outermostCall('clean(text) + tail'), null);
  const [sink] = classifySinks({
    repoRoot: '/',
    file: '/x.ts',
    source: 'node.innerHTML = open ? "<b>on</b>" : null;\n',
    structuralSanitizers: [],
  });
  assert.equal(sink.verdict, 'static');
});
