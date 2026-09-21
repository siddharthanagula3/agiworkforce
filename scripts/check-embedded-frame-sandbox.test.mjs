import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  escapesItsSandbox,
  findCreatedFrames,
  findEmbeddedFrames,
} from './lib/embedded-frames.mjs';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-embedded-frame-sandbox.mjs',
);

const OWED = 'apps/web/features/chat/components/artifacts/ArtifactPreview.tsx';
const DEDICATED = 'apps/web/features/chat/components/SandboxedIframe.tsx';

const SAFE_FRAME = `
export function Preview({ doc }) {
  return <iframe title="preview" sandbox="" srcDoc={doc} />;
}
`;

const DEDICATED_RENDERER = `
export function SandboxedIframe({ sandboxOrigin }) {
  return <iframe title="artifact" src={\`\${sandboxOrigin}/\`} sandbox="allow-scripts allow-same-origin" />;
}
`;

const OWED_FRAME = `
export function ArtifactPreview({ pdfSrc }) {
  return <iframe title="PDF Preview" src={pdfSrc} className="h-full w-full" />;
}
`;

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      output: execFileSync('node', [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const BASELINE = {
  'apps/web/features/chat/components/Preview.tsx': SAFE_FRAME,
  [DEDICATED]: DEDICATED_RENDERER,
  [OWED]: OWED_FRAME,
};

test('passes when every frame but the one it owes declares a sandbox', () => {
  const result = run(fixture(BASELINE));
  assert.equal(result.code, 0);
  assert.match(result.output, /3 embedded frames, 2 declaring a sandbox, 1 owed/);
});

test('fails on a new frame that embeds a document with no sandbox', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/app/gallery/Thumb.tsx': '<iframe title="thumb" srcDoc={html} />',
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /apps\/web\/app\/gallery\/Thumb\.tsx:1 embeds a document with no/);
});

test('fails when a frame outside the dedicated renderer takes both escape tokens', () => {
  const result = run(
    fixture({
      ...BASELINE,
      'apps/web/features/projects/Doc.tsx':
        '<iframe title="doc" src={uri} sandbox="allow-same-origin allow-scripts" />',
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /combines allow-scripts with allow-same-origin/);
});

test('fails when the dedicated renderer stops pointing at its own origin', () => {
  const result = run(
    fixture({
      ...BASELINE,
      [DEDICATED]: DEDICATED_RENDERER.replace('src={`${sandboxOrigin}/`}', 'srcDoc={doc}'),
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /combines allow-scripts with allow-same-origin/);
});

test('fails when the owed frame is fixed but its entry stays', () => {
  const result = run(
    fixture({ ...BASELINE, [OWED]: OWED_FRAME.replace('className=', 'sandbox="" className=') }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /declares every frame now; remove its entry/);
});

test('fails when an entry names a file that is gone', () => {
  const { [OWED]: _dropped, ...rest } = BASELINE;
  const result = run(fixture(rest));
  assert.equal(result.code, 1);
  assert.match(result.output, /stale entry/);
});

test('counts a sandbox assigned on the ref before the src, and not after it', () => {
  const before = `
    const iframeRef = useRef(null);
    iframeRef.current.setAttribute('sandbox', 'allow-scripts');
    iframeRef.current.src = url;
    export const Card = () => <iframe ref={iframeRef} title="app" />;
  `;
  const after = before
    .replace("iframeRef.current.setAttribute('sandbox', 'allow-scripts');\n", '')
    .replace(
      'iframeRef.current.src = url;',
      "iframeRef.current.src = url;\n    iframeRef.current.setAttribute('sandbox', 'allow-scripts');",
    );

  assert.equal(findEmbeddedFrames(before)[0].declared, true);
  assert.equal(findEmbeddedFrames(after)[0].declared, false);
});

test('reads frames out of the source and ignores a regex that names the tag', () => {
  assert.deepEqual(findEmbeddedFrames('const BLOCKED = [/<iframe/i, /<object/i];'), []);
  assert.equal(findEmbeddedFrames('<iframe sandbox="" srcDoc={x} />')[0].tokens.length, 0);
  assert.equal(findCreatedFrames("const f = document.createElement('iframe');").length, 1);
  assert.equal(escapesItsSandbox(['allow-scripts', 'allow-same-origin']), true);
  assert.equal(escapesItsSandbox(['allow-scripts']), false);
});
