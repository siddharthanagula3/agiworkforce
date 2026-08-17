import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ToolCallCard,
  detectFileDiff,
  detectResultDiff,
  looksLikeUnifiedDiff,
  parseUnifiedDiff,
} from '../ToolCallCard';

afterEach(cleanup);

const UNIFIED_PATCH = [
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,4 +1,4 @@',
  ' import { boot } from "./boot";',
  '-boot({ retries: 1 });',
  '+boot({ retries: 3 });',
  ' export {};',
].join('\n');

function expand(label: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('unified diff detection', () => {
  it('recognizes unified and envelope patch formats, rejects prose', () => {
    expect(looksLikeUnifiedDiff(UNIFIED_PATCH)).toBe(true);
    expect(looksLikeUnifiedDiff('*** Begin Patch\n*** Update File: a.ts\n+x\n')).toBe(true);
    expect(looksLikeUnifiedDiff('Wrote 42 bytes to /tmp/a.txt')).toBe(false);
  });

  it('classifies header, context, addition and removal lines', () => {
    const lines = parseUnifiedDiff(UNIFIED_PATCH);
    expect(lines.map((l) => l.type)).toEqual([
      'meta',
      'meta',
      'meta',
      'context',
      'remove',
      'add',
      'context',
    ]);
    expect(lines[4]).toEqual({ type: 'remove', content: 'boot({ retries: 1 });' });
    expect(lines[5]).toEqual({ type: 'add', content: 'boot({ retries: 3 });' });
  });

  it('reads the patch and file path out of apply_patch arguments', () => {
    const diff = detectFileDiff({ path: 'src/app.ts', patch: UNIFIED_PATCH });
    expect(diff).not.toBeNull();
    expect(diff?.filePath).toBe('src/app.ts');
    expect(diff?.additions).toBe(1);
    expect(diff?.deletions).toBe(1);
  });

  it('synthesizes a diff from old_text/new_text edit arguments', () => {
    const diff = detectFileDiff({
      file_path: 'src/app.ts',
      old_text: 'retries: 1',
      new_text: 'retries: 3\nverbose: true',
    });
    expect(diff?.deletions).toBe(1);
    expect(diff?.additions).toBe(2);
    expect(diff?.filePath).toBe('src/app.ts');
  });

  it('ignores non-diff arguments and non-diff results', () => {
    expect(detectFileDiff({ query: 'weather in Paris' })).toBeNull();
    expect(detectResultDiff('Wrote 42 bytes to /tmp/a.txt')).toBeNull();
  });

  it('falls back to the diff header for the file path when args carry none', () => {
    expect(detectResultDiff(UNIFIED_PATCH)?.filePath).toBe('src/app.ts');
  });
});

describe('ToolCallCard diff rendering', () => {
  it('renders patch arguments as red/green diff lines instead of escaped JSON', () => {
    render(
      <ToolCallCard
        id="t1"
        name="apply_patch"
        status="complete"
        args={{ path: 'src/app.ts', patch: UNIFIED_PATCH }}
      />,
    );
    expand(/apply_patch/i);

    const diff = screen.getByTestId('tool-file-diff');
    expect(diff.querySelectorAll('[data-diff-line="add"]')).toHaveLength(1);
    expect(diff.querySelectorAll('[data-diff-line="remove"]')).toHaveLength(1);
    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.getByText('-1')).toBeTruthy();
    expect(diff.textContent).toContain('boot({ retries: 3 });');
    expect(screen.queryByText(/\\n/)).toBeNull();
  });

  it('renders a diff-shaped tool result as diff lines', () => {
    render(<ToolCallCard id="t2" name="edit_file" status="complete" result={UNIFIED_PATCH} />);
    expand(/edit_file/i);

    const diff = screen.getByTestId('tool-file-diff');
    expect(diff.querySelectorAll('[data-diff-line="add"]')).toHaveLength(1);
    expect(diff.querySelectorAll('[data-diff-line="remove"]')).toHaveLength(1);
  });

  it('leaves an ordinary tool result as plain preformatted text', () => {
    render(
      <ToolCallCard
        id="t3"
        name="write_file"
        status="complete"
        args={{ path: '/tmp/a.txt' }}
        result="Wrote 42 bytes to /tmp/a.txt"
      />,
    );
    expand(/write_file/i);

    expect(screen.queryByTestId('tool-file-diff')).toBeNull();
    expect(screen.getByText('Wrote 42 bytes to /tmp/a.txt')).toBeTruthy();
  });
});
