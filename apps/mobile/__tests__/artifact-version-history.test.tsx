import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ArtifactVersionHistorySheet } from '@/src/features/chat/components/ArtifactVersionHistorySheet';
import { summarizeArtifactVersions } from '@/src/features/artifacts/versionSummary';

const versions = [
  { content: 'one\ntwo' },
  { content: 'one\ntwo\nthree', savedAt: '2026-09-28T10:00:00.000Z' },
  { content: 'one\ntwo', savedAt: '2026-09-28T11:00:00.000Z' },
];

describe('artifact version history', () => {
  it('lists every version newest first with what changed', () => {
    const summaries = summarizeArtifactVersions(versions);

    expect(summaries.map((summary) => summary.index)).toEqual([2, 1, 0]);
    expect(summaries[0].change).toBe('Same as version 1');
    expect(summaries[1].change).toBe('1 line added, 0 removed');
    expect(summaries[2].change).toBe('Created, 2 lines');
    expect(summaries[2].when).toBeNull();
    expect(summaries[1].when).not.toBeNull();
  });

  it('opens and restores a chosen version', () => {
    const onOpen = jest.fn();
    const onRestore = jest.fn();
    const { getByTestId, queryByTestId, getByText } = render(
      <ArtifactVersionHistorySheet
        visible
        versions={versions}
        shownIndex={2}
        onOpen={onOpen}
        onRestore={onRestore}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('Version 3, current')).toBeTruthy();
    expect(queryByTestId('artifact-version-restore-2')).toBeNull();

    fireEvent.press(getByTestId('artifact-version-row-0'));
    expect(onOpen).toHaveBeenCalledWith(0);

    fireEvent.press(getByTestId('artifact-version-restore-1'));
    expect(onRestore).toHaveBeenCalledWith(1);
  });
});
