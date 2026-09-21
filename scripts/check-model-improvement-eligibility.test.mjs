import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-model-improvement-eligibility.mjs',
);

const PRIVACY_PAGE = `
export default function Privacy() {
  return <p>AGI does not train AGI-owned models on customer prompts, responses, or files.</p>;
}
`;

const PRIVACY_SECTION = `
// 'improveModelTraining' is intentionally absent from TOGGLES: it persisted
// correctly and had no consumer anywhere.
export function PrivacySection() {
  return <p>There is no training opt-in, because that data path does not exist.</p>;
}
`;

function fixture(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-improvement-'));
  const write = (relative, source) => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  };
  write('apps/web/app/privacy/page.tsx', PRIVACY_PAGE);
  write('apps/web/features/settings/sections/PrivacySection.tsx', PRIVACY_SECTION);
  for (const [relative, source] of Object.entries(extra)) write(relative, source);
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

test('passes while nothing makes customer content eligible', () => {
  const result = run(fixture());
  assert.equal(result.code, 0);
  assert.match(result.output, /3 eligibility surfaces absent, 2 claims kept/);
});

test('fails when a training preference reappears as a real control', () => {
  const result = run(
    fixture({
      'apps/web/features/settings/sections/DataSection.tsx':
        "export const TOGGLES = [{ id: 'improveModelTraining', label: 'Help improve our models' }];\n",
    }),
  );
  assert.equal(result.code, 1);
  assert.match(
    result.output,
    /a training preference the settings screen deliberately does not offer/,
  );
});

test('fails when a path starts shipping content to a fine-tuning endpoint', () => {
  const result = run(
    fixture({
      'apps/web/lib/improve.ts':
        "export const submit = (body) => fetch('https://provider.example/v1/fine-tuning/jobs', { body });\n",
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /a call that submits content to a fine-tuning endpoint/);
});

test('fails when an export is built for training', () => {
  const result = run(
    fixture({
      'apps/web/lib/export.ts': 'export async function exportForTraining() { return rows(); }\n',
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /an export built for training a model/);
});

test('fails when the privacy page drops the promise the code keeps', () => {
  const root = fixture();
  fs.writeFileSync(
    path.join(root, 'apps/web/app/privacy/page.tsx'),
    'export default function Privacy() {\n  return <p>We care about your data.</p>;\n}\n',
  );
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /no longer states that customer content is not used/);
});

test('fails when the settings copy stops saying there is no opt-in', () => {
  const root = fixture();
  fs.writeFileSync(
    path.join(root, 'apps/web/features/settings/sections/PrivacySection.tsx'),
    'export function PrivacySection() {\n  return <p>Manage your data.</p>;\n}\n',
  );
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /PrivacySection\.tsx no longer states/);
});

test('refuses to pass on an empty tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-improvement-empty-'));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /is gone; the promise it carried is now unstated/);
});
