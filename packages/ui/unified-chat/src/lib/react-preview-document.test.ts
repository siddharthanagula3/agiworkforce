import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import {
  buildReactPreviewDocument,
  REACT_PREVIEW_SCRIPTS,
  REACT_PREVIEW_TRANSFORM,
  serializeForInlineScript,
} from './react-preview-document';

const requireFromHere = createRequire(import.meta.url);
const babel = requireFromHere('@babel/core') as {
  transformSync: (code: string, options: Record<string, unknown>) => { code: string } | null;
};
const BABEL_7_STAND_INS: Record<string, readonly [unknown, Record<string, unknown>]> = {
  react: [requireFromHere('@babel/plugin-transform-react-jsx'), {}],
  typescript: [requireFromHere('@babel/plugin-transform-typescript'), { isTSX: true }],
  'transform-modules-commonjs': [requireFromHere('@babel/plugin-transform-modules-commonjs'), {}],
};

type BabelEntry = string | readonly [string, Record<string, unknown>];

function plugin(entry: BabelEntry): unknown {
  const [name, options] = typeof entry === 'string' ? [entry, {}] : entry;
  const standIn = BABEL_7_STAND_INS[name];
  if (!standIn) throw new Error(`No stand-in for Babel entry ${name}`);
  return [standIn[0], { ...standIn[1], ...options }];
}

const babelStandIn = {
  transform(
    code: string,
    options: {
      filename: string;
      sourceType: string;
      presets: readonly BabelEntry[];
      plugins: readonly BabelEntry[];
    },
  ) {
    return babel.transformSync(code, {
      babelrc: false,
      configFile: false,
      filename: options.filename,
      sourceType: options.sourceType,
      plugins: [...options.presets, ...options.plugins].map(plugin),
    });
  },
};

async function runPreview(source: string) {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (error: unknown) => consoleErrors.push(String(error)));
  const dom = new JSDOM(buildReactPreviewDocument(source, CSP_META), {
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      Object.assign(window, { React, ReactDOM: ReactDOMClient, Babel: babelStandIn });
      window.addEventListener('error', (event) => errors.push(event.message));
    },
  });
  const root = dom.window.document.getElementById('root')!;
  await settle();
  return { dom, root, errors, consoleErrors };
}

async function settle() {
  for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const CSP_META = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">';

describe('buildReactPreviewDocument', () => {
  it('carries the CSP and every pinned runtime with its integrity hash', () => {
    const doc = buildReactPreviewDocument('const App = () => null;', CSP_META);
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain(CSP_META);
    expect(REACT_PREVIEW_SCRIPTS.map((script) => script.src)).toEqual([
      'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
      'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
      'https://unpkg.com/@babel/standalone@8.0.4/babel.min.js',
    ]);
    for (const script of REACT_PREVIEW_SCRIPTS) {
      expect(script.integrity).toMatch(/^sha384-/);
      expect(doc).toContain(
        `<script src="${script.src}" integrity="${script.integrity}" crossorigin="anonymous"></script>`,
      );
    }
    expect(doc.indexOf(CSP_META)).toBeLessThan(doc.indexOf(REACT_PREVIEW_SCRIPTS[0]!.src));
  });

  it('mounts App or Component from the source', () => {
    const doc = buildReactPreviewDocument('function App() { return <p>Hi</p>; }', CSP_META);
    expect(doc).toContain('function App() { return \\u003cp\\u003eHi\\u003c/p\\u003e; }');
    expect(doc).toContain("typeof App !== 'undefined' && App");
    expect(doc).toContain("typeof Component !== 'undefined' && Component");
    expect(doc).toContain('module.exports.default');
  });

  it('transforms JSX with the classic runtime instead of letting Babel 8 pick the automatic one', () => {
    const doc = buildReactPreviewDocument('function App() { return <p>Hi</p>; }', CSP_META);
    expect(doc).not.toContain('text/babel');
    expect(doc).not.toContain('data-presets');
    expect(REACT_PREVIEW_TRANSFORM.presets).toEqual([
      ['react', { runtime: 'classic' }],
      'typescript',
    ]);
    expect(REACT_PREVIEW_TRANSFORM.filename).toBe('Component.tsx');
    expect(REACT_PREVIEW_TRANSFORM.plugins).toEqual(['transform-modules-commonjs']);
    expect(doc).toContain(`var transform = ${JSON.stringify(REACT_PREVIEW_TRANSFORM)};`);
  });

  it('keeps the source from closing its script or opening a comment', () => {
    const doc = buildReactPreviewDocument('const s = "</script><img src=x>"; <!-- x', CSP_META);
    expect(doc).not.toContain('</script><img');
    expect(doc).toContain('\\u003c/script\\u003e\\u003cimg src=x\\u003e');
    expect(doc).toContain('\\u003c!-- x');
  });
});

describe('running the React preview document with a Babel 7 stand-in for the pinned standalone bundle', () => {
  it('renders a component with hooks, a fragment, React imports and a default export', async () => {
    const { dom, root, errors } = await runPreview(
      [
        "import React, { useState } from 'react';",
        'export default function Counter() {',
        '  const [count, setCount] = useState(0);',
        '  return (',
        '    <>',
        '      <p>Count: {count}</p>',
        '      <button onClick={() => setCount(count + 1)}>Add</button>',
        '    </>',
        '  );',
        '}',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(root.querySelector('p')?.textContent).toBe('Count: 0');
    root
      .querySelector('button')!
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
    expect(root.querySelector('p')?.textContent).toBe('Count: 1');
  });

  it('renders a plain App function that uses React.useState', async () => {
    const { root, errors } = await runPreview(
      'function App() {\n  const [on] = React.useState(true);\n  return <div>{on ? "Tiny Counter" : "off"}</div>;\n}',
    );
    expect(errors).toEqual([]);
    expect(root.textContent).toBe('Tiny Counter');
  });

  it('reports a syntax error with its own message', async () => {
    const { root, errors } = await runPreview('function App() { return <p>Hi</p> ');
    expect(root.textContent).toBe('');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Unexpected token/);
    expect(errors[0]).not.toMatch(/^Script error/);
  });

  it('reports an error thrown while rendering with its own message, also to the console', async () => {
    const { errors, consoleErrors } = await runPreview(
      'function App() { throw new Error("The list is empty"); }',
    );
    expect(errors).toEqual(['The list is empty']);
    expect(consoleErrors).toContain('Error: The list is empty');
  });

  it('renders a component with TypeScript annotations', async () => {
    const { root, errors } = await runPreview(
      [
        "import { useState } from 'react';",
        'type Props = { start?: number };',
        'export default function App({ start = 2 }: Props): JSX.Element {',
        '  const [count] = useState<number>(start);',
        '  return <p>Count: {count}</p>;',
        '}',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(root.textContent).toBe('Count: 2');
  });

  it('mounts a component that is only a named export', async () => {
    const { root, errors } = await runPreview(
      'export const formatCount = (n) => `${n}`;\nexport function Counter() { return <p>Named</p>; }',
    );
    expect(errors).toEqual([]);
    expect(root.textContent).toBe('Named');
  });

  it('says what is missing when the source has no component to mount', async () => {
    const { root, errors, consoleErrors } = await runPreview(
      'function Widget() { return <p>Hidden</p>; }',
    );
    expect(root.textContent).toBe('');
    expect(errors).toEqual(['The preview needs a default export or a component named App.']);
    expect(consoleErrors).toEqual([
      'Error: The preview needs a default export or a component named App.',
    ]);
  });

  it('leaves a source that mounts itself alone', async () => {
    const { root, errors } = await runPreview(
      [
        "import { createRoot } from 'react-dom/client';",
        'function Widget() { return <p>Self</p>; }',
        "createRoot(document.getElementById('root')).render(<Widget />);",
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(root.textContent).toBe('Self');
  });

  it('mounts an App that renders itself once', async () => {
    const { dom, root, errors } = await runPreview(
      [
        'function App() {',
        '  React.useEffect(() => { window.previewMounts = (window.previewMounts || 0) + 1; }, []);',
        '  return <p>Once</p>;',
        '}',
        "ReactDOM.createRoot(document.getElementById('root')).render(<App />);",
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(root.textContent).toBe('Once');
    expect((dom.window as unknown as { previewMounts?: number }).previewMounts).toBe(1);
  });

  it('names a package the preview cannot load', async () => {
    const { errors } = await runPreview(
      "import { Star } from 'lucide-react';\nexport default function App() { return <Star />; }",
    );
    expect(errors).toEqual([
      'The preview cannot load "lucide-react". Only React and ReactDOM are available.',
    ]);
  });
});

describe('serializeForInlineScript', () => {
  it('escapes markup and line-terminator characters and round-trips through JSON', () => {
    const value = { text: 'a</SCRIPT><!-- & \u2028\u2029 "q"' };
    const out = serializeForInlineScript(value);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(value);
  });
});
