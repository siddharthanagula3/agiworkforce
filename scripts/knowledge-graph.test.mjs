import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildKnowledgeGraph,
  queryKnowledgeGraph,
  renderKnowledgeGraph,
  scanJavaScriptModule,
  scanRustModule,
} from './knowledge-graph.mjs';

test('javascript scan ignores comments and strings and keeps real exports', () => {
  const source = `
    const text = "export function Fake";
    const other = 'export function Fake2';
    // export function Fake3
    /* export function Fake4 */
    const template = \`export function Fake5 \${import('dyn')}\`;
    export function real() {}
    export const { foo, bar: baz } = {};
    export const a: A = 1, b: B = 2;
    export const pattern = /a,[b-c]/g;
    const hidden = /^data:image\\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i;
    export const [fallback = 1] = pair;
    export type { Id as UserId };
    export { hello } from "./hello";
    export default function ChatPage() {}
    import "server-only";
  `;
  const scanned = scanJavaScriptModule(source);
  assert.deepEqual(
    scanned.exports,
    [
      'ChatPage',
      'UserId',
      'a',
      'b',
      'baz',
      'default',
      'fallback',
      'foo',
      'hello',
      'pattern',
      'real',
    ].sort((a, b) => a.localeCompare(b)),
  );
  assert.deepEqual(scanned.imports, ['./hello', 'dyn', 'server-only']);
  assert.equal(scanned.exports.includes('Fake'), false);
  assert.equal(scanned.exports.includes('Fake5'), false);
});

test('rust scan ignores commented items and keeps public names', () => {
  const source = `
    // pub fn hidden() {}
    pub fn visible() {}
    pub(crate) struct Thing {}
    pub use crate::foo::{Bar, baz::Qux as Renamed};
    pub use crate::foo::{*};
    RegistryCommand::builtin_slash(
        "plan",
        "Toggle plan mode",
    );
  `;
  const scanned = scanRustModule(source);
  assert.equal(scanned.exports.includes('hidden'), false);
  assert.ok(scanned.exports.includes('visible'));
  assert.ok(scanned.exports.includes('Thing'));
  assert.ok(scanned.exports.includes('Bar'));
  assert.ok(scanned.exports.includes('Renamed'));
  assert.ok(
    scanned.uses.some(
      (entry) => entry.parts.join('::') === 'crate::foo' && entry.exported === null,
    ),
  );
  assert.deepEqual(scanned.commands, ['plan']);
});

test('graph indexes every tracked file, route, import, and migration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-graph-'));
  const files = {
    'package.json': JSON.stringify({
      name: 'fixture-root',
      scripts: { 'check:demo': 'node scripts/check-demo.mjs' },
    }),
    'AGENTS.md': '# Root\n',
    'apps/web/package.json': JSON.stringify({
      name: '@agiworkforce/web',
      description: 'Web app',
    }),
    'apps/web/AGENTS.md': '# Web\n',
    'apps/web/tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } },
    }),
    'apps/web/proxy.ts': 'export function proxy() {}\n',
    'apps/web/lib/health.ts': 'export function check() {}\n',
    'apps/web/app/(app)/chat/[id]/page.tsx':
      '// export function Fake\nexport default function ChatPage() {}\n',
    'apps/web/app/api/chat/route.ts':
      'import { check } from "@/lib/health";\nimport { hello } from "@agiworkforce/types";\nexport function POST() { return check(hello); }\n',
    'apps/web/app/@modal/(.)photo/page.tsx': 'export default function Photo() {}\n',
    'apps/web/db/neon/0002_next.sql': 'CREATE TABLE sessions (id int);\n',
    'apps/web/db/neon/0001_init.sql':
      '-- CREATE TABLE fake (id int);\nCREATE TABLE IF NOT EXISTS users (id int);\n',
    'packages/contracts/types/package.json': JSON.stringify({
      name: '@agiworkforce/types',
      description: 'Shared types',
    }),
    'packages/contracts/types/src/index.ts': 'export function hello() {}\n',
    'crates/demo/Cargo.toml': '[package]\nname = "demo"\ndescription = "Demo crate"\n',
    'crates/demo/src/lib.rs':
      '// pub fn hidden() {}\npub fn visible() {}\npub(crate) struct Thing {}\nuse crate::foo::local_item;\n',
    'crates/demo/src/foo.rs': 'pub struct Bar {}\npub fn local_item() {}\n',
    'scripts/check-demo.mjs': 'export const guard = true;\n',
    'scripts/check-demo.test.mjs': 'export const notAGuard = true;\n',
    '.agents/skills/demo/SKILL.md': `---\nname: demo\ndescription: A demo skill ${String.fromCharCode(0x2014)} with a clause\n---\n`,
    'docs/agent-context/lanes.json': JSON.stringify({
      lanes: [
        {
          id: 'web-app',
          name: 'Web',
          ownerRole: 'Web lead',
          ownedWritePaths: ['apps/web/**'],
          blockedPaths: [],
          requiredChecks: ['pnpm --filter @agiworkforce/web test'],
        },
      ],
    }),
    'docs/agent-context/repo-map.json': JSON.stringify({
      surfaces: [
        {
          name: 'Web',
          path: 'apps/web',
          owner: 'Web lead',
          purpose: 'Account and chat',
          primaryChecks: ['pnpm --filter @agiworkforce/web typecheck'],
        },
      ],
      workspaceUnits: [
        {
          path: 'packages/contracts/types',
          kind: 'package',
          canonicalOwner: 'Platform',
          trustBoundary: 'shared contracts',
        },
      ],
    }),
  };
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }

  const graph = buildKnowledgeGraph(root, {
    trackedFiles: Object.keys(files),
    workspaceGlobs: ['apps/*', 'packages/*/*', 'crates/*'],
    cargoMembers: ['crates/demo'],
    dependencyGraph: {
      typescript: { edges: [{ from: '@agiworkforce/web', to: '@agiworkforce/types' }] },
      rust: { edges: [] },
    },
  });

  assert.equal(graph.manifest.fileNodes, Object.keys(files).length);
  assert.equal(graph.symbols.Fake, undefined);
  assert.equal(graph.symbols.hidden, undefined);
  assert.ok(graph.symbols.visible.includes('crates/demo/src/lib.rs'));
  assert.ok(graph.symbols.hello.includes('packages/contracts/types/src/index.ts'));

  const route = graph.files.find((file) => file.path === 'apps/web/app/api/chat/route.ts');
  assert.ok(route.imports.includes('apps/web/lib/health.ts'));
  assert.ok(route.imports.includes('packages/contracts/types'));
  assert.deepEqual(route.lanes, ['web-app']);

  const chat = graph.routes.find((item) => item.file.endsWith('chat/[id]/page.tsx'));
  assert.equal(chat.url, '/chat/:id');
  const endpoint = graph.routes.find((item) => item.file.endsWith('api/chat/route.ts'));
  assert.equal(endpoint.url, '/api/chat');
  assert.deepEqual(endpoint.methods, ['POST']);
  const modal = graph.routes.find((item) => item.file.includes('@modal'));
  assert.equal(modal.url, null);

  const users = graph.migrations.find((item) => item.path.endsWith('0001_init.sql'));
  const sessions = graph.migrations.find((item) => item.path.endsWith('0002_next.sql'));
  assert.deepEqual(users.tables, ['users']);
  assert.equal(users.follows, null);
  assert.equal(sessions.follows, users.path);
  assert.equal(
    graph.migrations.some((item) => item.tables.includes('fake')),
    false,
  );

  const web = graph.units.find((unit) => unit.path === 'apps/web');
  assert.equal(web.owner, 'Web lead');
  assert.ok(web.dependsOn.includes('packages/contracts/types'));
  assert.equal(web.agentsDoc, 'apps/web/AGENTS.md');
  assert.ok(web.checks.includes('pnpm --filter @agiworkforce/web test'));
  const rust = graph.files.find((file) => file.path === 'crates/demo/src/lib.rs');
  assert.ok(rust.imports.includes('crates/demo/src/foo.rs'));
  assert.equal(
    graph.guards.some(
      (guard) => guard.path === 'scripts/check-demo.mjs' && guard.pnpm.includes('check:demo'),
    ),
    true,
  );
  assert.equal(
    graph.guards.some((guard) => guard.path.endsWith('.test.mjs')),
    false,
  );
  assert.equal(graph.skills[0].name, 'demo');
  assert.equal(graph.skills[0].description, 'A demo skill: with a clause');

  const rendered = renderKnowledgeGraph(graph);
  for (const [rel, content] of Object.entries(rendered)) {
    const dest = path.join(root, 'docs/agent-context/generated', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  const symbol = queryKnowledgeGraph(root, 'symbol', 'check');
  assert.match(symbol, /apps\/web\/lib\/health\.ts/);
  const found = queryKnowledgeGraph(root, 'route', '/api/chat');
  assert.match(found, /POST/);
  const file = queryKnowledgeGraph(root, 'file', 'apps/web/proxy.ts');
  assert.match(file, /agents doc: apps\/web\/AGENTS.md/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a path alias target substitutes the captured text verbatim, at every star', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-graph-alias-'));
  const files = {
    'package.json': JSON.stringify({ name: 'fixture-root' }),
    'apps/web/package.json': JSON.stringify({ name: '@agiworkforce/web' }),
    'apps/web/tsconfig.json': JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: { '@dollar/*': ['./lib/*'], '@twice/*': ['./lib/*/*'] },
      },
    }),
    'apps/web/lib/a$&b.ts': 'export const dollar = 1;\n',
    'apps/web/lib/dir/dir.ts': 'export const twice = 1;\n',
    'apps/web/app/use.ts':
      'import { dollar } from "@dollar/a$&b";\nimport { twice } from "@twice/dir";\nexport const both = [dollar, twice];\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  const graph = buildKnowledgeGraph(root, {
    trackedFiles: Object.keys(files),
    workspaceGlobs: ['apps/*'],
    cargoMembers: [],
    dependencyGraph: { typescript: { edges: [] }, rust: { edges: [] } },
  });
  const user = graph.files.find((file) => file.path === 'apps/web/app/use.ts');
  assert.ok(user.imports.includes('apps/web/lib/a$&b.ts'));
  assert.ok(user.imports.includes('apps/web/lib/dir/dir.ts'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('rendering folds opaque paths into one record per directory and keeps the rest', () => {
  const graph = {
    manifest: { schemaVersion: 1 },
    units: [],
    routes: [],
    migrations: [],
    symbols: {},
    edges: [],
    skills: [],
    guards: [],
    slashCommands: [],
    agentsDocs: [],
    files: [
      { path: 'tools/evals/runs/model-a.chat.json', unit: 'tools/evals', role: 'config' },
      { path: 'tools/evals/runs/model-b.chat.json', unit: 'tools/evals', role: 'config' },
      { path: 'tools/evals/src/live.ts', unit: 'tools/evals', role: 'source' },
    ],
  };
  const rendered = renderKnowledgeGraph(graph, {
    isOpaquePath: (filePath) => filePath.includes('/runs/'),
  });
  const records = rendered['knowledge-graph/files/tools.jsonl']
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => record.path);
  assert.deepEqual(records, [
    { path: 'tools/evals/runs/', unit: 'tools/evals', role: 'config', folded: 2 },
    { path: 'tools/evals/src/live.ts', unit: 'tools/evals', role: 'source' },
  ]);
  assert.equal(JSON.parse(rendered['knowledge-graph/manifest.json']).foldedFiles, 2);
  assert.doesNotMatch(rendered['knowledge-graph/files/tools.jsonl'], /model-a/);
});

test('live proxy module exports the names the web app publishes', () => {
  const source = fs.readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'apps/web/proxy.ts'),
    'utf8',
  );
  const scanned = scanJavaScriptModule(source);
  for (const name of [
    'PUBLIC_API_ROUTE_PATTERNS',
    'buildApiHostRedirectTarget',
    'proxy',
    'config',
  ]) {
    assert.ok(scanned.exports.includes(name), name);
  }
});
