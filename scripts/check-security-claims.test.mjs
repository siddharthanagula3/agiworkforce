import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  extractClaimUnits,
  runSecurityClaimsCheck,
  UNPROVEN_CEILING,
} from './check-security-claims.mjs';

const DOCUMENT = `# Security

Status: Current

## 1. Gate

A saved deny is enforced server-side before any side effect.

| Rank | Verdict |
| ---- | ------- |
| 1    | deny    |
| 2    | allow   |

## 2. Ceilings

Loading never throws on an excessive scope.

### Ceiling table

| Connector id | Ceiling |
| ------------ | ------- |
| \`gmail\`      | narrow  |
| \`slack\`      | narrow  |
`;

const MANIFEST = `export const CONNECTOR_OAUTH_SCOPE_CEILINGS = {
  gmail: ['a'],
  slack: ['b'],
};
`;

function baseIndex() {
  return {
    document: 'docs/security/security.md',
    claims: [
      {
        id: 'deny-is-enforced',
        section: '1. Gate',
        kind: 'prose',
        sentence: 'A saved deny is enforced server-side before any side effect.',
        implementation: ['apps/web/lib/gate.ts#resolveGate'],
        proof: [{ kind: 'guard', file: 'scripts/check-gate.mjs' }],
      },
      {
        id: 'gate-table',
        section: '1. Gate',
        kind: 'rows',
        rows: 2,
        implementation: ['apps/web/lib/gate.ts'],
        proof: [{ kind: 'test', file: 'apps/web/lib/gate.test.ts', name: 'the gate table' }],
      },
      {
        id: 'loading-never-throws',
        section: '2. Ceilings',
        kind: 'prose',
        sentence: 'Loading never throws on an excessive scope.',
        implementation: ['apps/web/lib/gate.ts'],
        proof: [{ kind: 'test', file: 'apps/web/lib/gate.test.ts', name: 'the gate table' }],
      },
      {
        id: 'ceiling-table',
        section: 'Ceiling table',
        kind: 'rows',
        rows: 2,
        implementation: ['apps/web/lib/connectors/oauth-scope-allowlist.ts'],
        proof: [{ kind: 'guard', file: 'scripts/check-gate.mjs' }],
      },
    ],
    unproven: [],
    narrative: [],
  };
}

function makeRoot(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'security-claims-'));
  const write = (relative, contents) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };
  const state = { document: DOCUMENT, manifest: MANIFEST, index: baseIndex() };
  mutate(state, write);
  write('docs/security/security.md', state.document);
  write('docs/security/security-claims.json', JSON.stringify(state.index, null, 2));
  write('apps/web/lib/connectors/oauth-scope-allowlist.ts', state.manifest);
  if (state.keepSources !== false) {
    write('apps/web/lib/gate.ts', 'export function resolveGate() {}\n');
    write('apps/web/lib/gate.test.ts', "describe('the gate table', () => {});\n");
    write('scripts/check-gate.mjs', 'export default 1;\n');
    write('scripts/check-gate.test.mjs', 'export default 1;\n');
  }
  return root;
}

function failuresFor(mutate) {
  return runSecurityClaimsCheck(makeRoot(mutate));
}

test('a document whose every claim is indexed and proved passes', () => {
  assert.deepEqual(
    failuresFor(() => {}),
    [],
  );
});

test('the extractor finds prose claims and table rows, and skips header rows', () => {
  const units = extractClaimUnits(DOCUMENT);
  assert.equal(units.filter((unit) => unit.kind === 'prose').length, 2);
  assert.equal(units.filter((unit) => unit.kind === 'row' && unit.section === '1. Gate').length, 2);
});

test('a claim sentence with no index entry fails', () => {
  const failures = failuresFor((state) => {
    state.document = state.document.replace(
      '## 2. Ceilings',
      '## 2. Ceilings\n\nA connector token never reaches the client.',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('has no entry in')),
    failures.join('\n'),
  );
});

test('a sentence edited in the document without the index fails', () => {
  const failures = failuresFor((state) => {
    state.document = state.document.replace(
      'A saved deny is enforced server-side before any side effect.',
      'A saved deny is enforced on the client before any side effect.',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('the document changed without the index')),
    failures.join('\n'),
  );
});

test('a proof file that has moved fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims[0].proof = [{ kind: 'guard', file: 'scripts/check-moved.mjs' }];
  });
  assert.ok(
    failures.some((failure) =>
      failure.includes('proof file "scripts/check-moved.mjs" does not exist'),
    ),
    failures.join('\n'),
  );
});

test('a test name that no longer exists fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims[2].proof = [
      { kind: 'test', file: 'apps/web/lib/gate.test.ts', name: 'a test nobody wrote' },
    ];
  });
  assert.ok(
    failures.some((failure) => failure.includes('test "a test nobody wrote" no longer exists')),
    failures.join('\n'),
  );
});

test('a guard cited without its own self-test fails', () => {
  const failures = failuresFor((state, write) => {
    state.index.claims[0].proof = [{ kind: 'guard', file: 'scripts/check-lonely.mjs' }];
    write('scripts/check-lonely.mjs', 'export default 1;\n');
  });
  assert.ok(
    failures.some((failure) => failure.includes('has no self-test')),
    failures.join('\n'),
  );
});

test('an implementing symbol that has been renamed fails', () => {
  const failures = failuresFor((state, write) => {
    state.keepSources = false;
    write('apps/web/lib/gate.ts', 'export function decideGate() {}\n');
    write('apps/web/lib/gate.test.ts', "describe('the gate table', () => {});\n");
    write('scripts/check-gate.mjs', 'export default 1;\n');
    write('scripts/check-gate.test.mjs', 'export default 1;\n');
  });
  assert.ok(
    failures.some((failure) => failure.includes('no longer contains "resolveGate"')),
    failures.join('\n'),
  );
});

test('an unproven claim with no reason fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims = state.index.claims.filter((claim) => claim.id !== 'loading-never-throws');
    state.index.unproven.push({
      id: 'loading-never-throws',
      section: '2. Ceilings',
      kind: 'prose',
      sentence: 'Loading never throws on an excessive scope.',
      implementation: ['apps/web/lib/gate.ts'],
    });
  });
  assert.ok(
    failures.some((failure) => failure.includes('is unproven and states no reason')),
    failures.join('\n'),
  );
});

test('more unproven claims than the ceiling allows fails', () => {
  const failures = failuresFor((state) => {
    state.document = state.document.replace('## 2. Ceilings', `## 2. Ceilings\n\n${extra()}`);
    state.index.unproven = Array.from({ length: UNPROVEN_CEILING + 1 }, (_, position) => ({
      id: `unproved-${position}`,
      section: '2. Ceilings',
      kind: 'prose',
      sentence: `Nothing proves statement ${position} is not false.`,
      implementation: ['apps/web/lib/gate.ts'],
      reason: 'no executable assertion reaches this statement yet, and one has to be written',
    }));
  });
  assert.ok(
    failures.some((failure) => failure.includes('exceeds the ceiling')),
    failures.join('\n'),
  );
});

function extra() {
  return Array.from(
    { length: UNPROVEN_CEILING + 1 },
    (_, position) => `Nothing proves statement ${position} is not false.`,
  ).join('\n\n');
}

test('a narrative entry with an unknown reason fails', () => {
  const failures = failuresFor((state) => {
    state.index.claims = state.index.claims.filter((claim) => claim.id !== 'loading-never-throws');
    state.index.narrative.push({
      id: 'loading-never-throws',
      section: '2. Ceilings',
      kind: 'prose',
      sentence: 'Loading never throws on an excessive scope.',
      implementation: ['apps/web/lib/gate.ts'],
      why: 'because-i-said-so',
    });
  });
  assert.ok(
    failures.some((failure) => failure.includes('narrative "why"')),
    failures.join('\n'),
  );
});

test('a ceiling table that omits a connector the manifest enforces fails', () => {
  const failures = failuresFor((state) => {
    state.manifest = state.manifest.replace('  slack:', "  notion: ['c'],\n  slack:");
  });
  assert.ok(
    failures.some((failure) =>
      failure.includes('omits connector(s) the manifest enforces: notion'),
    ),
    failures.join('\n'),
  );
});

test('a table that grows a row without the index fails', () => {
  const failures = failuresFor((state) => {
    state.document = state.document.replace(
      '| 2    | allow   |',
      '| 2    | allow   |\n| 3    | ask     |',
    );
  });
  assert.ok(
    failures.some((failure) => failure.includes('now holds 3 table rows')),
    failures.join('\n'),
  );
});
