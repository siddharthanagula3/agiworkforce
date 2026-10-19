import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkAgainstRatchet,
  countByRule,
  fetchesData,
  isRouteComponent,
  missingStates,
  scanRouteStates,
} from './lib/route-states.mjs';

const BARE_ROUTE = `'use client';
import { useEffect, useState } from 'react';

export default function InvoicesPage() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    fetch('/api/invoices')
      .then((r) => r.json())
      .then(setRows);
  }, []);
  return <ul>{rows.map((row) => <li key={row.id}>{row.total}</li>)}</ul>;
}
`;

const COMPLETE_ROUTE = `'use client';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@shared/lib/to-user-message';

export default function InvoicesPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['invoices'] });
  if (isLoading) return <Spinner />;
  if (isError) return <p>{toUserMessage(error, 'Could not load invoices')}</p>;
  if (data.length === 0) return <EmptyState title="No invoices yet" />;
  return <ul>{data.map((row) => <li key={row.id}>{row.total}</li>)}</ul>;
}
`;

test('a data-fetching route with none of the three states is reported for all three', () => {
  const findings = scanRouteStates(BARE_ROUTE, 'apps/web/app/invoices/page.tsx');
  assert.deepEqual(findings.map((f) => f.rule).sort(), ['empty', 'error', 'loading']);
});

test('a route that renders all three states is clean', () => {
  assert.deepEqual(scanRouteStates(COMPLETE_ROUTE, 'apps/web/app/invoices/page.tsx'), []);
});

test('each state is detected independently', () => {
  assert.deepEqual(missingStates(COMPLETE_ROUTE), []);
  assert.deepEqual(missingStates(BARE_ROUTE).sort(), ['empty', 'error', 'loading']);
  assert.deepEqual(
    missingStates(COMPLETE_ROUTE.replace('if (isLoading) return <Spinner />;', '')).filter(
      (rule) => rule === 'loading',
    ),
    [],
    'isLoading in the destructure still counts as a loading state',
  );
});

test('a Skeleton counts as a loading state and an EmptyState as an empty one', () => {
  assert.ok(!missingStates("<Skeleton />;\n<EmptyState title='x' />;").includes('loading'));
  assert.ok(!missingStates("<Skeleton />;\n<EmptyState title='x' />;").includes('empty'));
});

test('the sign-in progress block counts as a loading state and an unknown component does not', () => {
  assert.ok(!missingStates("<AuthProgress label='x' />;").includes('loading'));
  assert.ok(missingStates("<AuthFrame label='x' />;").includes('loading'));
});

test('a list mapped from an imported constant owes no empty state', () => {
  const form = `'use client';
import { APPLICATION_KINDS } from './kinds';
export function ApplyForm() {
  const submit = () => fetch('/api/apply', { method: 'POST' });
  return <select>{APPLICATION_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select>;
}
`;
  assert.ok(!missingStates(form).includes('empty'));
});

test('rows from the response still owe an empty state beside an imported constant list', () => {
  const route = `'use client';
import { APPLICATION_KINDS } from './kinds';
export function Applications() {
  const [rows, setRows] = useState([]);
  useEffect(() => { fetch('/api/applications').then((r) => r.json()).then(setRows); }, []);
  return <>
    {APPLICATION_KINDS.map((kind) => <h2 key={kind}>{kind}</h2>)}
    {rows.map((row) => <p key={row.id}>{row.name}</p>)}
  </>;
}
`;
  assert.ok(missingStates(route).includes('empty'));
});

test('a constant-named list the file builds itself still owes an empty state', () => {
  const route = `'use client';
export function Applications({ data }) {
  const ROWS = data.items;
  return <ul>{ROWS.map((row) => <li key={row.id}>{row.name}</li>)}</ul>;
}
`;
  assert.ok(missingStates(route).includes('empty'));
});

test('a failed status on the state object counts as an error state', () => {
  assert.ok(
    !missingStates("if (state.status === 'failed') return <p>{state.reason}</p>;").includes(
      'error',
    ),
  );
  assert.ok(!missingStates("if (state.status === 'error') return <Retry />;").includes('error'));
});

test('a status union that never renders its failure is still reported', () => {
  const route = `'use client';
export function Preview() {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => { fetch('/x').then(() => setState({ status: 'ready' })); }, []);
  if (state.status === 'loading') return <Spinner />;
  return <div />;
}
`;
  assert.ok(missingStates(route).includes('error'));
});

test('a server component is out of scope even when it fetches', () => {
  assert.equal(fetchesData(BARE_ROUTE.replace("'use client';\n", '')), false);
  assert.deepEqual(
    scanRouteStates(BARE_ROUTE.replace("'use client';\n", ''), 'apps/web/app/x.tsx'),
    [],
  );
});

test('a client component that fetches nothing is out of scope', () => {
  assert.equal(fetchesData("'use client';\nexport function Badge() { return <span />; }"), false);
});

test('a fetch call inside a comment does not put a file in scope', () => {
  assert.equal(
    fetchesData("'use client';\n// the caller will fetch('/api/x') for us\nexport const A = 1;"),
    false,
  );
});

test('scope covers app, features and shared but not tests or other apps', () => {
  assert.ok(isRouteComponent('apps/web/app/invoices/page.tsx'));
  assert.ok(isRouteComponent('apps/web/features/admin/pages/AdminPage.tsx'));
  assert.ok(isRouteComponent('apps/web/shared/components/Thing.tsx'));
  assert.ok(!isRouteComponent('apps/web/app/invoices/page.test.tsx'));
  assert.ok(!isRouteComponent('apps/web/app/__tests__/page.tsx'));
  assert.ok(!isRouteComponent('apps/mobile/src/Screen.tsx'));
  assert.ok(!isRouteComponent('apps/web/app/invoices/route.ts'));
});

test('the ratchet fails when a count grows and passes when it shrinks', () => {
  const counts = countByRule([
    { file: 'a.tsx', rule: 'loading' },
    { file: 'b.tsx', rule: 'loading' },
  ]);
  assert.deepEqual(counts, { loading: 2, empty: 0, error: 0 });
  assert.equal(
    checkAgainstRatchet(counts, { maxMissing: { loading: 2, empty: 0, error: 0 } }).length,
    0,
  );
  assert.equal(
    checkAgainstRatchet(counts, { maxMissing: { loading: 1, empty: 0, error: 0 } }).length,
    1,
  );
  assert.equal(
    checkAgainstRatchet(counts, { maxMissing: { loading: 9, empty: 9, error: 9 } }).length,
    0,
  );
});

test('a ratchet missing a rule is itself an error, so a new rule cannot ship unmeasured', () => {
  assert.equal(checkAgainstRatchet(countByRule([]), { maxMissing: { loading: 0 } }).length, 2);
});
