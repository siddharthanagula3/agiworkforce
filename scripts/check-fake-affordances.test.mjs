import assert from 'node:assert/strict';
import test from 'node:test';

import { checkAgainstRatchet, countByRule, findFakeAffordances } from './lib/fake-affordances.mjs';

const rules = (source) => findFakeAffordances(source, 'a.tsx').map((f) => f.rule);

test('flags a control wired to an empty handler', () => {
  assert.deepEqual(rules('<Button onClick={() => {}}>Export</Button>'), ['dead-control']);
  assert.deepEqual(rules('<Button onClick={() => undefined}>Export</Button>'), ['dead-control']);
  assert.deepEqual(rules('<Button onClick={noop}>Export</Button>'), ['dead-control']);
  assert.deepEqual(rules('<form onSubmit={(_e) => {}} />'), ['dead-control']);
});

test('accepts a control wired to real work or disabled with a reason', () => {
  assert.deepEqual(rules('<Button onClick={() => exportRows()}>Export</Button>'), []);
  assert.deepEqual(rules('<Button disabled title="Export needs a workspace">Export</Button>'), []);
});

test('flags a success message shown before the write is awaited', () => {
  const optimistic = `
    async function save() {
      toast.success('Saved');
      await fetch('/api/settings', { method: 'POST', body });
    }
  `;
  assert.deepEqual(rules(optimistic), ['fake-success']);
});

test('accepts a success message that follows the awaited write', () => {
  const honest = `
    async function save() {
      const response = await fetch('/api/settings', { method: 'POST', body });
      if (!response.ok) { toast.error(toUserMessage(response, 'Could not save')); return; }
      toast.success('Saved');
    }
  `;
  assert.deepEqual(rules(honest), []);
});

test('does not call a toast that reports a returned status a fake success', () => {
  const redirectNotice = `
    useEffect(() => {
      const notice = getCallbackNotice(searchParams.get('github'));
      if (notice?.kind === 'success') { toast.success(notice.message); }
    }, [searchParams]);
  `;
  assert.deepEqual(rules(redirectNotice), []);
});

test('flags placeholder copy but not an honest capability message', () => {
  assert.deepEqual(rules('<p>Lorem ipsum dolor sit amet</p>'), ['placeholder-copy']);
  assert.deepEqual(rules('<p>This page is under construction</p>'), ['placeholder-copy']);
  assert.deepEqual(
    rules('<p>Managed Code is coming soon. Cloud sessions are not available.</p>'),
    [],
  );
});

test('flags a bare identifier rendered as body text', () => {
  assert.deepEqual(rules('<span>{entry.id}</span>'), ['raw-identifier']);
  assert.deepEqual(rules('<code>{session.sessionId}</code>'), ['raw-identifier']);
});

test('leaves identifiers that are keys, props or shortened alone', () => {
  assert.deepEqual(rules('<li key={entry.id}>{entry.name}</li>'), []);
  assert.deepEqual(rules('<label htmlFor={field.id}>Name</label>'), []);
  assert.deepEqual(rules('<span>{entry.id.slice(0, 8)}</span>'), []);
});

test('a finding inside a comment is not a finding', () => {
  assert.deepEqual(rules('// <Button onClick={() => {}}>Export</Button>'), []);
  assert.deepEqual(rules('/* Lorem ipsum dolor */'), []);
});

test('the ratchet fails on growth and reports every unmeasured rule', () => {
  const counts = countByRule([{ file: 'a.tsx', line: 1, rule: 'dead-control' }]);
  assert.equal(
    checkAgainstRatchet(counts, {
      maxFindings: {
        'placeholder-copy': 0,
        'dead-control': 0,
        'fake-success': 0,
        'raw-identifier': 2,
      },
    }).length,
    1,
  );
  assert.equal(
    checkAgainstRatchet(counts, {
      maxFindings: {
        'placeholder-copy': 0,
        'dead-control': 1,
        'fake-success': 0,
        'raw-identifier': 2,
      },
    }).length,
    0,
  );
  assert.equal(checkAgainstRatchet(counts, { maxFindings: {} }).length, 4);
});
