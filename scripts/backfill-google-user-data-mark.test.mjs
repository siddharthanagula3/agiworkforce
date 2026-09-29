import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPLY_SQL,
  DRY_RUN_SQL,
  GOOGLE_CONNECTOR_SERVER_IDS,
  connectorMentionPattern,
  parseArgs,
  runBackfill,
} from './backfill-google-user-data-mark.mjs';

function fakeClient(pages) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [pages[calls.length - 1] ?? { last_id: null, scanned: 0, marked: 0 }];
    },
  };
}

test('walks conversations in id order and resumes from the last id of each batch', async () => {
  const client = fakeClient([
    { last_id: '00000000-0000-0000-0000-00000000000a', scanned: 2, marked: 1 },
    { last_id: '00000000-0000-0000-0000-00000000000b', scanned: 1, marked: 0 },
  ]);
  const outcome = await runBackfill({ client, apply: true, batchSize: 2 });

  assert.deepEqual(outcome, {
    scanned: 3,
    marked: 1,
    batches: 2,
    cursor: '00000000-0000-0000-0000-00000000000b',
  });
  assert.equal(client.calls[0].params[0], '00000000-0000-0000-0000-000000000000');
  assert.equal(client.calls[1].params[0], '00000000-0000-0000-0000-00000000000a');
  assert.equal(client.calls[0].params[1], 2);
  assert.equal(client.calls.length, 2, 'a short batch ends the walk');
});

test('starts from --after so a stopped run resumes where it left off', async () => {
  const client = fakeClient([]);
  await runBackfill({ client, after: '11111111-1111-1111-1111-111111111111' });
  assert.equal(client.calls[0].params[0], '11111111-1111-1111-1111-111111111111');
});

test('writes only with --apply, and only unmarked rows', async () => {
  const dry = fakeClient([]);
  await runBackfill({ client: dry });
  assert.equal(dry.calls[0].sql, DRY_RUN_SQL);
  assert.doesNotMatch(DRY_RUN_SQL, /\bupdate\b/i);

  const wet = fakeClient([]);
  await runBackfill({ client: wet, apply: true });
  assert.equal(wet.calls[0].sql, APPLY_SQL);
  assert.match(APPLY_SQL, /c\.google_user_data_at is null\s+and c\.id > \$1::uuid/);
  assert.match(APPLY_SQL, /and c\.google_user_data_at is null\s+and \(/);
});

test('reads every kind of Google evidence the product records', () => {
  for (const evidence of [
    /m\.metadata -> 'tools'/,
    /'toolInvocations' -> 'offered'/,
    /'mcpContext' -> 'prompt' ->> 'connectorId'/,
    /'mcpContext' -> 'resources'/,
    /external_resource_references/,
    /research_reports/,
    /user_custom_connectors cc/,
    /\(googleapis\|google\|youtube\)/,
  ]) {
    assert.match(APPLY_SQL, evidence);
  }
});

test('the mention pattern matches research connector lists and citations', () => {
  const pattern = new RegExp(connectorMentionPattern());
  assert.match('{"sources":{"connectors":["notion","gmail"]}}', pattern);
  assert.match('[{"connectorId":"google-drive","url":"x"}]', pattern);
  assert.doesNotMatch('{"connectors":["notion"],"note":"gmail"}', pattern);
  assert.ok(GOOGLE_CONNECTOR_SERVER_IDS.includes('gmail'));
});

test('bounds the batch size and refuses a malformed cursor', () => {
  assert.throws(() => parseArgs(['--batch-size', '0']));
  assert.throws(() => parseArgs(['--batch-size', '50000']));
  assert.throws(() => parseArgs(['--after', 'x']));
  assert.deepEqual(parseArgs(['--apply']).apply, true);
});
