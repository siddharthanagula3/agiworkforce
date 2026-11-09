import { describe, expect, it } from 'vitest';

import { artifactChanges } from '../artifact-changes';

describe('artifactChanges', () => {
  it('reports a punctuation-only edit as changed while counting no words', () => {
    const changes = artifactChanges('Amount: $100.', 'Amount: -$100.', 'word');

    expect(changes.added).toBe(0);
    expect(changes.removed).toBe(0);
    expect(changes.changed).toBe(true);
    expect(changes.runs.some((run) => run.kind === 'added' && run.text.includes('-'))).toBe(true);
  });

  it('reports a whitespace-only edit as changed', () => {
    expect(artifactChanges('a b', 'a  b', 'word').changed).toBe(true);
  });

  it('reports identical text as unchanged', () => {
    const changes = artifactChanges('same text.', 'same text.', 'word');

    expect(changes.changed).toBe(false);
    expect(changes.added).toBe(0);
    expect(changes.removed).toBe(0);
  });

  it('reports a word insertion as changed with a count', () => {
    const changes = artifactChanges('one two', 'one two three', 'word');

    expect(changes.changed).toBe(true);
    expect(changes.added).toBe(1);
  });

  it('reports line edits and identical lines', () => {
    expect(artifactChanges('a\nb', 'a\nc', 'line').changed).toBe(true);
    expect(artifactChanges('a\nb', 'a\nb', 'line').changed).toBe(false);
  });
});
