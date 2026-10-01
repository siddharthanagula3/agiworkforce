import { describe, expect, it } from 'vitest';
import { toolApprovalStakes } from '../tool-approval-stakes';
import {
  detectFileDiff,
  detectResultDiff,
  looksLikeUnifiedDiff,
  parseUnifiedDiff,
} from '../tool-request-diff';

describe('tool approval stakes', () => {
  it('shows actual recipients and payment items without unrelated arguments', () => {
    expect(
      toolApprovalStakes('send_message', {
        toRecipients: [
          { emailAddress: { address: 'recipient@fixture.invalid' } },
          { email: 'second@fixture.invalid' },
        ],
        body: 'Do not summarize this as a recipient',
      }),
    ).toEqual([
      {
        kind: 'recipient',
        label: 'To recipients',
        value: 'recipient@fixture.invalid, second@fixture.invalid',
      },
    ]);
    expect(
      toolApprovalStakes('checkout', {
        amount: 0,
        currency_code: 'USD',
        items: [{ name: 'Draft' }, { id: 'item-1' }],
        quantity: 2,
      }),
    ).toEqual([
      { kind: 'amount', label: 'Amount', value: '0' },
      { kind: 'amount', label: 'Currency code', value: 'USD' },
      { kind: 'item', label: 'Items', value: 'Draft, item-1' },
      { kind: 'item', label: 'Quantity', value: '2' },
    ]);
    expect(
      toolApprovalStakes('read_file', { to: 'recipient@fixture.invalid', amount: 10 }),
    ).toEqual([]);
    expect(toolApprovalStakes('send_message', undefined)).toEqual([]);
    expect(toolApprovalStakes('send_message', { to: [null, {}, [], ' ', Infinity] })).toEqual([]);
  });

  it('bounds display values and delegates phone mutations to their canonical stakes', () => {
    expect(
      toolApprovalStakes('send_message', {
        to: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
      }),
    ).toEqual([
      { kind: 'recipient', label: 'To', value: 'one, two, three, four, five, six and 1 more' },
    ]);
    expect(toolApprovalStakes('send_message', { to: 'x'.repeat(200) })[0]?.value).toBe(
      'x'.repeat(159) + '…',
    );
    expect(toolApprovalStakes('device_reminder_create', { title: 'Review' })).toEqual([
      { kind: 'item', label: 'Reminder', value: 'Review' },
    ]);
  });
});

describe('file changes shown for review', () => {
  const patch =
    'diff --git a/example.ts b/example.ts\n--- a/example.ts\n+++ b/example.ts\n@@ -1 +1 @@\n-old\n+new\n context\n\\ No newline at end of file';

  it('distinguishes headers from changes and infers the destination file', () => {
    expect(looksLikeUnifiedDiff(patch)).toBe(true);
    expect(parseUnifiedDiff(patch).map((line) => line.type)).toEqual([
      'meta',
      'meta',
      'meta',
      'meta',
      'remove',
      'add',
      'context',
      'meta',
    ]);
    expect(detectFileDiff({ patch })).toMatchObject({
      filePath: 'example.ts',
      additions: 1,
      deletions: 1,
    });
    expect(detectResultDiff(patch, { path: 'fallback.ts' })).toMatchObject({
      filePath: 'example.ts',
      additions: 1,
      deletions: 1,
    });
    expect(detectFileDiff({ path: 'explicit.ts', patch })?.filePath).toBe('explicit.ts');
  });

  it('reads patch envelopes and explicit old/new text, including deletion and creation', () => {
    expect(
      detectResultDiff('*** Begin Patch\n*** Update File: example.ts\n-old\n+new'),
    ).toMatchObject({ filePath: 'example.ts', additions: 1, deletions: 1 });
    expect(
      detectFileDiff({ file_path: 'example.ts', old_string: 'old\nline', new_string: 'new' }),
    ).toEqual({
      filePath: 'example.ts',
      additions: 1,
      deletions: 2,
      lines: [
        { type: 'remove', content: 'old' },
        { type: 'remove', content: 'line' },
        { type: 'add', content: 'new' },
      ],
    });
    expect(detectFileDiff({ before: 'old', after: '' })).toMatchObject({
      additions: 0,
      deletions: 1,
    });
    expect(detectFileDiff({ newText: 'new' })).toMatchObject({ additions: 1, deletions: 0 });
    expect(
      detectResultDiff('@@ -1 +1 @@\n-old\n+new', { target_file: 'fallback.ts' })?.filePath,
    ).toBe('fallback.ts');
  });

  it('does not fabricate a change from output, headers, or non-text arguments', () => {
    expect(detectFileDiff()).toBeNull();
    expect(detectFileDiff({ oldText: 1, newText: null })).toBeNull();
    expect(detectFileDiff({ patch: '@@ -1 +1 @@\n context' })).toBeNull();
    expect(detectFileDiff({ before: '', after: '' })).toBeNull();
    expect(detectResultDiff()).toBeNull();
    expect(detectResultDiff('plain output')).toBeNull();
    expect(detectResultDiff('+++ /dev/null\n@@ -1 +0,0 @@\n-old')?.filePath).toBeUndefined();
  });
});
