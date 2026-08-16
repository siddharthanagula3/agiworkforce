import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeKeybindings,
  analyzeRouteNavigation,
  collectCommandArities,
  collectRouteLiterals,
  extractPersistedKeys,
  findWriteOnlyCollections,
  findWriteOnlyStorageKeys,
  INVARIANTS,
  normalizeRoutePath,
  partitionViolations,
  readAllowlist,
  requiredArity,
  routePathForFile,
} from './check-surface-invariants.mjs';

test('a keybinding with no args fails against a handler that requires one', () => {
  const sources = new Map([
    [
      'src/core/commandSetup.ts',
      [
        "register('ext.needsSession', async (sessionId: string) => {});",
        "register('ext.optionalSession', async (sessionId?: string) => {});",
        "register('ext.noArgs', async () => {});",
        "register('ext.defaulted', async (mode = 'chat') => {});",
        "register('ext.rest', async (...args: unknown[]) => {});",
      ].join('\n'),
    ],
  ]);
  const arities = collectCommandArities(sources);
  assert.equal(arities.get('ext.needsSession').arity, 1);
  assert.equal(arities.get('ext.optionalSession').arity, 0);
  assert.equal(arities.get('ext.noArgs').arity, 0);
  assert.equal(arities.get('ext.defaulted').arity, 0);
  assert.equal(arities.get('ext.rest').arity, 0);

  const violations = analyzeKeybindings({
    surface: 'vscode',
    keybindings: [
      { command: 'ext.needsSession', key: 'escape' },
      { command: 'ext.optionalSession', key: 'ctrl+r' },
      { command: 'ext.needsSession', key: 'ctrl+k', args: 'session-1' },
    ],
    arities,
  });

  assert.equal(violations.length, 1);
  assert.match(violations[0].detail, /requires 1 argument\(s\); the keypress is a silent no-op/);
});

test('a keybinding for a command with no registration at all fails closed', () => {
  const violations = analyzeKeybindings({
    surface: 'vscode',
    keybindings: [{ command: 'ext.ghost', key: 'ctrl+g' }],
    arities: new Map(),
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].detail, /no command registration/);
});

test('a handler shape that cannot be proved safe fails rather than passing silently', () => {
  const arities = collectCommandArities(
    new Map([['src/a.ts', "register('ext.byReference', someImportedHandler);"]]),
  );
  assert.equal(arities.get('ext.byReference').arity, null);

  const violations = analyzeKeybindings({
    surface: 'vscode',
    keybindings: [{ command: 'ext.byReference', key: 'ctrl+b' }],
    arities,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].detail, /could not be proved to tolerate a zero-argument call/);
});

test('requiredArity stops at the first optional parameter', () => {
  assert.equal(requiredArity('a: string, b: number'), 2);
  assert.equal(requiredArity('a: string, b?: number'), 1);
  assert.equal(requiredArity(''), 0);
  assert.equal(requiredArity('{ a, b }: Options'), 1);
});

test('routes are matched against navigation literals, including template prefixes', () => {
  assert.equal(routePathForFile('(app)/settings/index.tsx'), '/settings');
  assert.equal(
    routePathForFile('(app)/settings/permissions/[permission].tsx'),
    '/settings/permissions/[permission]',
  );
  assert.equal(normalizeRoutePath('/(app)/settings/general?tab=1'), '/settings/general');

  const routes = [
    {
      surface: 'mobile',
      file: 'app/(app)/settings/permissions/[permission].tsx',
      routeRelative: '(app)/settings/permissions/[permission].tsx',
      route: '/settings/permissions/[permission]',
    },
    {
      surface: 'mobile',
      file: 'app/(app)/dead.tsx',
      routeRelative: '(app)/dead.tsx',
      route: '/dead',
    },
  ];

  const literalsByFile = new Map([
    [
      'src/features/settings/index.tsx',
      collectRouteLiterals('router.push(`/(app)/settings/permissions/${kind}`);'),
    ],
  ]);

  const violations = analyzeRouteNavigation({
    routes,
    literalsByFile,
    declaredScreens: new Set(),
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].detail, /route \/dead/);
});

test('a route declared as a navigator Screen counts as reachable', () => {
  const violations = analyzeRouteNavigation({
    routes: [
      {
        surface: 'mobile',
        file: 'app/(app)/(tabs)/chat.tsx',
        routeRelative: '(app)/(tabs)/chat.tsx',
        route: '/chat',
      },
    ],
    literalsByFile: new Map(),
    declaredScreens: new Set(['chat']),
  });
  assert.deepEqual(violations, []);
});

test('a route file cannot vouch for itself', () => {
  const violations = analyzeRouteNavigation({
    routes: [
      {
        surface: 'mobile',
        file: 'app/(app)/dead.tsx',
        routeRelative: '(app)/dead.tsx',
        route: '/dead',
      },
    ],
    literalsByFile: new Map([
      ['app/(app)/dead.tsx', collectRouteLiterals("const self = '/dead';")],
    ]),
    declaredScreens: new Set(),
  });
  assert.equal(violations.length, 1);
});

test('extractPersistedKeys captures persisted fields from both arrow-body shapes', () => {
  const concise = extractPersistedKeys(
    [
      'persist(fn, {',
      '  name: "store",',
      '  partialize: (state) => ({',
      '    topLevel: state.topLevel,',
      '    nested: { leaf: state.nested.leaf },',
      '    derived: computeSomething(),',
      '  }),',
      '})',
    ].join('\n'),
  );
  assert.ok(concise.has('topLevel'));
  assert.ok(concise.has('leaf'), 'nested leaves are what the user actually experiences');
  assert.ok(!concise.has('nested'), 'a wrapper object is not itself a persisted field');
  assert.ok(!concise.has('derived'), 'only state-derived properties are persisted fields');

  assert.ok(
    extractPersistedKeys('partialize: (state) => ({ drafts: Array.from(state.drafts) })').has(
      'drafts',
    ),
  );

  const block = extractPersistedKeys(
    [
      'partialize: (state) => {',
      '  const base = { always: state.always };',
      '  if (isNative()) {',
      '    return { ...base, nativeOnly: state.nativeOnly };',
      '  }',
      '  return base;',
      '}',
    ].join('\n'),
  );
  assert.deepEqual([...block].sort(), ['always', 'nativeOnly']);
});

test('a Map that is only written is reported; one that is iterated is not', () => {
  const writeOnly = findWriteOnlyCollections(
    'src/background.ts',
    [
      'const webmcpToolsByTab = new Map<number, string[]>();',
      'webmcpToolsByTab.set(tabId, tools);',
      'webmcpToolsByTab.delete(tabId);',
    ].join('\n'),
  );
  assert.equal(writeOnly.length, 1);
  assert.match(writeOnly[0].detail, /webmcpToolsByTab/);

  const iterated = findWriteOnlyCollections(
    'src/runtime.ts',
    [
      'private readonly listeners = new Set<Fn>();',
      'this.listeners.add(fn);',
      'this.listeners.delete(fn);',
      'for (const listener of this.listeners) listener();',
    ].join('\n'),
  );
  assert.deepEqual(iterated, []);

  const returned = findWriteOnlyCollections(
    'src/store.ts',
    [
      'const next = new Map(state.items);',
      'next.set(id, item);',
      'return { ...state, items: next };',
    ].join('\n'),
  );
  assert.deepEqual(returned, []);
});

test('a web-storage key with no reader anywhere in the repo is reported', () => {
  const source = "localStorage.setItem('agi-last-error', payload);";
  assert.equal(findWriteOnlyStorageKeys('src/a.ts', source, new Set()).length, 1);
  assert.equal(
    findWriteOnlyStorageKeys('src/a.ts', source, new Set(['agi-last-error'])).length,
    0,
    'a reader in any module clears the finding',
  );
});

test('the invariant allowlist demands a reason and a tracker, and rejects duplicates', () => {
  assert.throws(() => readAllowlist({ schemaVersion: 2, invariants: {} }), /schemaVersion 1/);
  assert.throws(
    () => readAllowlist({ schemaVersion: 1, invariants: { a: [{ id: 'x', reason: 'short' }] } }),
    /at least 20 characters/,
  );
  assert.throws(
    () =>
      readAllowlist({
        schemaVersion: 1,
        invariants: { a: [{ id: 'x', reason: 'y'.repeat(30), trackedBy: '' }] },
      }),
    /trackedBy/,
  );
  assert.throws(
    () =>
      readAllowlist({
        schemaVersion: 1,
        invariants: {
          a: [
            { id: 'x', reason: 'y'.repeat(30), trackedBy: 'SIX-32' },
            { id: 'x', reason: 'y'.repeat(30), trackedBy: 'SIX-32' },
          ],
        },
      }),
    /twice/,
  );
});

test('declared violations pass and stale declarations fail', () => {
  const declared = [{ id: 'a', reason: 'y'.repeat(30), trackedBy: 'SIX-32' }];

  const matching = partitionViolations([{ id: 'a', detail: 'a' }], declared);
  assert.deepEqual(matching.undeclared, []);
  assert.deepEqual(matching.stale, []);

  const fixed = partitionViolations([], declared);
  assert.deepEqual(fixed.stale, ['a']);

  const regressed = partitionViolations(
    [
      { id: 'a', detail: 'a' },
      { id: 'b', detail: 'b' },
    ],
    declared,
  );
  assert.deepEqual(
    regressed.undeclared.map((violation) => violation.id),
    ['b'],
  );
});

test('every declared invariant is runnable and has an allowlist bucket', () => {
  const ids = INVARIANTS.map((invariant) => invariant.id);
  assert.deepEqual(ids, [
    'settings-section-registered',
    'route-has-navigation',
    'persisted-field-has-reader',
    'collection-has-reader',
    'keybinding-tolerates-no-args',
  ]);
  for (const invariant of INVARIANTS) {
    assert.equal(typeof invariant.run, 'function');
    assert.ok(invariant.label.length > 0);
  }
});
