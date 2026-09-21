import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CATALOG,
  PAGE,
  REGISTRY,
  admissibleProviders,
  declaredProviderIds,
  managedTrafficRule,
  recipientNames,
  runSubprocessorCoverageCheck,
} from './check-subprocessor-coverage.mjs';

function route(provider, overrides = {}) {
  return {
    provider,
    selectable: true,
    trustModes: ['managed_cloud', 'byok'],
    commercialStatus: 'agi_direct',
    ...overrides,
  };
}

function tree() {
  return {
    [CATALOG]: `const MANAGED_TRAFFIC_COMMERCIAL_STATUSES: ReadonlySet<string> = Object.freeze(
  new Set<string>(['agi_direct', 'authorized_marketplace', 'free_commercial']),
);
const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
`,
    [REGISTRY]: JSON.stringify({
      routes: {
        'alpha/one': route('alpha'),
        'beta/one': route('beta', { commercialStatus: 'authorized_marketplace' }),
        'beta/two': route('beta', { commercialStatus: 'authorized_marketplace' }),
        'gamma/one': route('gamma', { commercialStatus: 'experimental_only' }),
        'delta/one': route('delta', { selectable: false }),
        'epsilon/one': route('epsilon', { trustModes: ['byok'] }),
      },
    }),
    [PAGE]: `const SUBS: Subprocessor[] = [
  {
    name: 'Alpha',
    purpose: 'Inference.',
    region: 'United States',
    registryProviderIds: ['alpha'],
  },
  {
    name: 'Beta',
    purpose: 'Inference.',
    region: 'United States',
    registryProviderIds: ['beta'],
  },
];

function subRows(): LedgerRow[] {
  return SUBS.map((s) => ({ label: s.name, value: s.purpose }));
}

const page = <Ledger caption="Subprocessors" rows={subRows()} />;
`,
  };
}

function write(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'subprocessor-coverage-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

function failuresFor(mutate) {
  const files = tree();
  mutate(files);
  return runSubprocessorCoverageCheck(write(files));
}

test('a page that names every admissible provider passes', () => {
  assert.deepEqual(
    failuresFor(() => {}),
    [],
  );
});

test('dropping a recipient that serves managed traffic fails', () => {
  const failures = failuresFor((files) => {
    files[PAGE] = files[PAGE].replace("registryProviderIds: ['beta'],", 'registryProviderIds: [],');
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^beta has 2 route\(s\) admissible for managed traffic/);
});

test('a provider whose only routes are experimental, unselectable or byok needs no entry', () => {
  const failures = failuresFor(() => {});
  for (const provider of ['gamma', 'delta', 'epsilon']) {
    assert.equal(
      failures.some((failure) => failure.startsWith(provider)),
      false,
    );
  }
});

test('a route that becomes admissible while the page stands still fails', () => {
  const failures = failuresFor((files) => {
    const registry = JSON.parse(files[REGISTRY]);
    registry.routes['gamma/one'].commercialStatus = 'agi_direct';
    files[REGISTRY] = JSON.stringify(registry);
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^gamma has 1 route\(s\) admissible/);
});

test('a misspelled provider id is reported rather than counted as coverage', () => {
  const failures = failuresFor((files) => {
    files[PAGE] = files[PAGE].replace("'beta'", "'betta'");
  });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /claims registry provider "betta", which no route/);
  assert.match(failures[1], /^beta has 2 route\(s\) admissible/);
});

test('a page that declares ids but stops rendering them fails', () => {
  const failures = failuresFor((files) => {
    files[PAGE] = files[PAGE].replace('rows={subRows()}', 'rows={[]}');
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no longer renders its recipients through "rows=\{subRows\(\)\}"/);
});

test('a page with no declared ids fails rather than passing empty', () => {
  const failures = failuresFor((files) => {
    files[PAGE] = files[PAGE].replace(/registryProviderIds: \[[^\]]*\],/g, '');
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /declares no registryProviderIds/);
});

test('widening the admission rule without a page change fails', () => {
  const failures = failuresFor((files) => {
    files[CATALOG] = files[CATALOG].replace("'free_commercial'", "'experimental_only'");
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^gamma has 1 route\(s\) admissible/);
});

test('an unreadable admission rule fails closed', () => {
  const failures = failuresFor((files) => {
    files[CATALOG] = 'export const nothing = 1;';
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no longer declares MANAGED_TRAFFIC_COMMERCIAL_STATUSES/);
});

test('the admission rule is read off the module that enforces it', () => {
  const rule = managedTrafficRule(tree()[CATALOG]);
  assert.deepEqual([...rule.statuses].sort(), [
    'agi_direct',
    'authorized_marketplace',
    'free_commercial',
  ]);
  assert.equal(rule.trustMode, 'managed_cloud');
});

test('admissible routes are counted per provider', () => {
  const rule = managedTrafficRule(tree()[CATALOG]);
  const providers = admissibleProviders(JSON.parse(tree()[REGISTRY]), rule);
  assert.deepEqual([...providers.keys()].sort(), ['alpha', 'beta']);
  assert.equal(providers.get('beta').count, 2);
});

test('declared ids and recipient names are read off the page', () => {
  const { declared, blocks } = declaredProviderIds(tree()[PAGE]);
  assert.deepEqual([...declared].sort(), ['alpha', 'beta']);
  assert.equal(blocks, 2);
  assert.deepEqual(recipientNames(tree()[PAGE]), ['Alpha', 'Beta']);
});
