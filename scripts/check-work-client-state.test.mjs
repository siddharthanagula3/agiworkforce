import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-work-client-state.mjs',
);

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'work-client-state-'));
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

const PREFERENCE_STORE = `
import { persist, createJSONStorage } from 'zustand/middleware';
export const useToolStore = create(
  persist(
    (set) => ({ pendingApprovals: [], filters: {}, trustedWorkflows: [] }),
    {
      name: 'tool-storage',
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        trustedWorkflows: state.trustedWorkflows,
        filters: state.filters,
      }),
    },
  ),
);
`;

test('passes a store that persists preferences and leaves run state in memory', () => {
  const result = run(fixture({ 'apps/web/shared/stores/tool-store.ts': PREFERENCE_STORE }));
  assert.equal(result.code, 0);
  assert.match(result.output, /1 persisted stores/);
});

test('fails a store that persists the approvals queue', () => {
  const result = run(
    fixture({
      'apps/web/shared/stores/tool-store.ts': PREFERENCE_STORE.replace(
        'trustedWorkflows: state.trustedWorkflows,',
        'trustedWorkflows: state.trustedWorkflows,\n        pendingApprovals: state.pendingApprovals,',
      ),
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /persists pendingApprovals/);
});

test('fails a store that holds run state and persists everything', () => {
  const result = run(
    fixture({
      'apps/web/shared/stores/tool-store.ts': PREFERENCE_STORE,
      'apps/web/shared/stores/work-store.ts': `
import { persist, createJSONStorage } from 'zustand/middleware';
export const useWorkStore = create(
  persist((set) => ({ runStatus: 'idle', toolExecutions: [] }), {
    name: 'work-storage',
    storage: createJSONStorage(() => window.localStorage),
  }),
);
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /no partialize to leave it out/);
});

test('fails a browser key that pins one run', () => {
  const result = run(
    fixture({
      'apps/web/shared/stores/tool-store.ts': PREFERENCE_STORE,
      'apps/web/features/chat/WorkPanel.tsx': `
export function remember(runId, state) {
  window.localStorage.setItem(\`agi:work:\${runId}\`, JSON.stringify(state));
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /per-run browser key/);
});

test('leaves a settings store that never mentions Work state alone', () => {
  const result = run(
    fixture({
      'apps/web/shared/stores/tool-store.ts': PREFERENCE_STORE,
      'apps/web/shared/stores/settings-store.ts': `
import { persist, createJSONStorage } from 'zustand/middleware';
export const useSettings = create(
  persist((set) => ({ theme: 'dark' }), {
    name: 'settings',
    storage: createJSONStorage(() => window.localStorage),
  }),
);
`,
    }),
  );

  assert.equal(result.code, 0);
});

test('does not mistake a local save helper called persist for a persisted store', () => {
  const result = run(
    fixture({
      'apps/web/shared/stores/tool-store.ts': PREFERENCE_STORE,
      'apps/web/features/settings/ApprovalsPanel.tsx': `
export function ApprovalsPanel() {
  const persist = (policy) => fetch('/api/settings/approvals', { method: 'PUT', body: policy });
  return <button onClick={() => void persist('ask')}>Save tool approvals</button>;
}
`,
    }),
  );

  assert.equal(result.code, 0);
});

test('fails when no persisted store is found at all', () => {
  const result = run(fixture({ 'apps/web/shared/noop.ts': 'export const noop = () => null;\n' }));
  assert.equal(result.code, 1);
  assert.match(result.output, /scan roots are stale/);
});
