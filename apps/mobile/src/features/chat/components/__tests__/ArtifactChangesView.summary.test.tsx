import React from 'react';
import { render } from '@testing-library/react-native';

import { ArtifactChangesView } from '../ArtifactChangesView';

function summaryFor(previous: string, next: string, unit: 'line' | 'word'): string {
  const { getByTestId } = render(
    <ArtifactChangesView
      previous={previous}
      next={next}
      unit={unit}
      fromVersion={1}
      bottomInset={0}
    />,
  );
  const children = getByTestId('artifact-changes-summary').props.children as unknown;
  return Array.isArray(children) ? children.join('') : String(children);
}

describe('ArtifactChangesView summary', () => {
  it('does not claim no changes for a punctuation-only edit', () => {
    expect(summaryFor('Amount: $100.', 'Amount: -$100.', 'word')).not.toContain('No changes');
  });

  it('claims no changes only for identical content', () => {
    expect(summaryFor('same text.', 'same text.', 'word')).toBe('No changes since version 1');
    expect(summaryFor('a\nb', 'a\nb', 'line')).toBe('No changes since version 1');
  });

  it('keeps the counted summary for a word insertion', () => {
    expect(summaryFor('one two', 'one two three', 'word')).toContain('1 word added');
  });
});
