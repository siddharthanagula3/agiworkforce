import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { policyLiterals, scriptSourceOf } from './check-security-response-headers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(repoRoot, 'scripts/check-security-response-headers.mjs');

const PROXY = `
export function buildCsp(nonce: string): string {
  const devUnsafeEval = process.env['NODE_ENV'] === 'production' ? '' : " 'unsafe-eval'";
  return \`
    default-src 'self';
    script-src 'self' 'nonce-\${nonce}'\${devUnsafeEval} https://js.stripe.com;
    style-src 'self' 'unsafe-inline';
    object-src 'none';
  \`.trim();
}

export function apply(response: Response, nonce: string) {
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
}
`;

function withTree(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'response-headers-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, contents);
    }
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runGuard(root) {
  try {
    return { code: 0, output: execFileSync('node', [guard, '--root', root], { encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('a nonce policy with the dev allowance behind an interpolation passes', () => {
  withTree({ 'apps/web/proxy.ts': PROXY }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 0, output);
  });
});

test('a literal unsafe-inline in script-src fails', () => {
  withTree(
    {
      'apps/web/proxy.ts': PROXY.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /script-src admits unsafe-inline/);
    },
  );
});

test('a sandboxed document may turn script execution loose', () => {
  withTree(
    {
      'apps/web/proxy.ts': PROXY,
      'apps/web/app/api/sandbox/route.ts': `
export function GET() {
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  ].join('; ');
  return new Response('', { headers: { 'Content-Security-Policy': policy } });
}
`,
    },
    (root) => assert.equal(runGuard(root).code, 0),
  );
});

test('a wildcard origin on a public document passes and a credentialed one fails', () => {
  const publicRoute = `
export function GET() {
  return Response.json({ ok: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });
}
`;
  withTree({ 'apps/web/proxy.ts': PROXY, 'apps/web/app/meta/route.ts': publicRoute }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 0, output);
    assert.match(output, /1 wildcard CORS origin/);
  });
  withTree(
    {
      'apps/web/proxy.ts': PROXY,
      'apps/web/app/meta/route.ts': publicRoute.replace(
        "'Access-Control-Allow-Origin': '*'",
        "'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true'",
      ),
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /any site can read a response carrying this user's session/);
    },
  );
});

test('a wildcard origin on a route that reads the session fails', () => {
  withTree(
    {
      'apps/web/proxy.ts': PROXY,
      'apps/web/app/me/route.ts': `
import { requireUser } from '@/lib/api-auth';

export async function GET() {
  const user = await requireUser();
  return Response.json(user, { headers: { 'Access-Control-Allow-Origin': '*' } });
}
`,
    },
    (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1);
      assert.match(output, /reads the caller's session/);
    },
  );
});

test('turning off certificate verification fails', () => {
  for (const off of [
    'const options = { rejectUnauthorized: false };',
    "process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';",
    'const options = { checkServerIdentity: () => undefined };',
  ]) {
    withTree({ 'apps/web/proxy.ts': PROXY, 'apps/web/lib/dial.ts': `${off}\n` }, (root) => {
      const { code, output } = runGuard(root);
      assert.equal(code, 1, off);
      assert.match(output, /turns off TLS certificate verification/);
    });
  }
});

test('a tree with no policy at all fails rather than reporting success', () => {
  withTree({ 'apps/web/lib/plain.ts': 'export const a = 1;\n' }, (root) => {
    const { code, output } = runGuard(root);
    assert.equal(code, 1);
    assert.match(output, /no Content-Security-Policy was found/);
  });
});

test('a directive is bounded by its own semicolon', () => {
  assert.equal(
    scriptSourceOf("script-src 'self'; style-src 'unsafe-inline'").includes('unsafe'),
    false,
  );
  assert.equal(scriptSourceOf("default-src 'self'"), null);
  assert.match(scriptSourceOf("script-src 'self' 'unsafe-eval'; img-src *"), /unsafe-eval/);
});

test('policyLiterals reads a template across its newlines and a string up to its quote', () => {
  assert.deepEqual(policyLiterals("const a = `default-src 'self';\\n  script-src 'self'`;"), [
    "default-src 'self';\\n  script-src 'self'",
  ]);
  assert.deepEqual(policyLiterals("const a = 'frame-ancestors none'; const b = 'plain';"), [
    'frame-ancestors none',
  ]);
});
