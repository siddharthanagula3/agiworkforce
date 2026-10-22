import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { CloudCodeChanges } from '@agiworkforce/cloud-contracts';

const mockCopyToClipboard = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}));

jest.mock('@/src/lib/capabilities', () => ({
  useCapability: () => true,
}));

jest.mock('@/src/features/voice/components/VoiceInputButton', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    VoiceInputButton: ({ onTranscription }: { onTranscription: (text: string) => void }) => (
      <Pressable testID="voice-input-button" onPress={() => onTranscription('add a test')} />
    ),
  };
});

import {
  cloudCodeChangeTotals,
  cloudCodeCompactCount,
  cloudCodeDiffLineCounts,
  cloudCodeLineCountsByPath,
} from '@/src/features/cloud-code/presentation';
import { CloudCodeChangesCard } from '@/src/features/cloud-code/components/CloudCodeChangesCard';
import { CloudCodeChangesSheet } from '@/src/features/cloud-code/components/CloudCodeChangesSheet';
import { CloudCodeComposer } from '@/src/features/cloud-code/components/CloudCodeComposer';
import { CloudCodeTranscript } from '@/src/features/cloud-code/components/CloudCodeTranscript';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' keep',
  '-old one',
  '--- dashed removed',
  '+new one',
  '+++ plus plus added',
  '+new two',
  '\\ No newline at end of file',
  'diff --git a/src/b.ts b/src/b.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/b.ts',
  '@@ -0,0 +1,2 @@',
  '+line',
  '+line',
].join('\n');

function changesWith(count: number, diff = DIFF): CloudCodeChanges {
  const files = Array.from({ length: count }, (_, index) => ({
    path: index === 0 ? 'src/a.ts' : index === 1 ? 'src/b.ts' : `src/file-${index}.ts`,
    state: 'modified' as const,
  }));
  return {
    session: {} as CloudCodeChanges['session'],
    base: 'main',
    workingBranch: 'agi/work',
    files,
    diff,
    diffTruncated: false,
  };
}

describe('cloud code line counts', () => {
  it('counts body lines only and ignores file headers', () => {
    expect(cloudCodeDiffLineCounts(DIFF)).toEqual({ added: 5, removed: 2 });
  });

  it('counts per file path', () => {
    const counts = cloudCodeLineCountsByPath(DIFF);
    expect(counts.get('src/a.ts')).toEqual({ added: 3, removed: 2 });
    expect(counts.get('src/b.ts')).toEqual({ added: 2, removed: 0 });
  });

  it('totals the diff against the file list and counts files without a diff section', () => {
    const files = [{ path: 'src/a.ts' }, { path: 'src/b.ts' }, { path: 'notes.txt' }];
    expect(cloudCodeChangeTotals(files, DIFF)).toEqual({ files: 3, added: 5, removed: 2 });
  });

  it('counts nothing for an empty or hunkless diff', () => {
    expect(cloudCodeDiffLineCounts('')).toEqual({ added: 0, removed: 0 });
    expect(cloudCodeDiffLineCounts('diff --git a/x b/x\nBinary files a/x and b/x differ')).toEqual({
      added: 0,
      removed: 0,
    });
  });

  it('abbreviates large counts', () => {
    expect(cloudCodeCompactCount(0)).toBe('0');
    expect(cloudCodeCompactCount(999)).toBe('999');
    expect(cloudCodeCompactCount(1000)).toBe('1K');
    expect(cloudCodeCompactCount(14_300)).toBe('14.3K');
    expect(cloudCodeCompactCount(999_960)).toBe('1M');
    expect(cloudCodeCompactCount(2_500_000)).toBe('2.5M');
  });
});

describe('CloudCodeChangesCard', () => {
  it('renders nothing without changed files', () => {
    const { queryByTestId } = render(<CloudCodeChangesCard changes={null} onOpen={jest.fn()} />);
    expect(queryByTestId('cloud-code-changes-card')).toBeNull();
  });

  it('shows every file and no footer when three or fewer changed', () => {
    const { getByText, queryByText } = render(
      <CloudCodeChangesCard changes={changesWith(2)} onOpen={jest.fn()} />,
    );
    expect(getByText('2 files changed')).toBeTruthy();
    expect(getByText('src/a.ts')).toBeTruthy();
    expect(getByText('src/b.ts')).toBeTruthy();
    expect(queryByText(/View \d+ more/)).toBeNull();
  });

  it('caps at three rows, shows the remaining count, and opens the sheet from the footer', () => {
    const onOpen = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <CloudCodeChangesCard changes={changesWith(30)} onOpen={onOpen} />,
    );
    expect(getByText('30 files changed')).toBeTruthy();
    expect(getByText('src/file-2.ts')).toBeTruthy();
    expect(queryByText('src/file-3.ts')).toBeNull();
    fireEvent.press(getByLabelText('View 27 more files'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows green added and red removed totals', () => {
    const { getAllByLabelText } = render(
      <CloudCodeChangesCard changes={changesWith(2)} onOpen={jest.fn()} />,
    );
    expect(getAllByLabelText('5 lines added, 2 lines removed')).toHaveLength(1);
    expect(getAllByLabelText('3 lines added, 2 lines removed')).toHaveLength(1);
  });

  it('collapses the rows from the header', () => {
    const { getByLabelText, queryByText } = render(
      <CloudCodeChangesCard changes={changesWith(5)} onOpen={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('5 files changed'));
    expect(queryByText('src/a.ts')).toBeNull();
    expect(queryByText(/View \d+ more/)).toBeNull();
  });
});

describe('CloudCodeTranscript reply actions', () => {
  const items = [
    {
      kind: 'reply' as const,
      id: 'r1',
      at: '2026-10-22T00:00:00Z',
      text: 'Done. I updated the parser.',
      stopReason: null,
      retryGoal: null,
      retryMode: 'agent' as const,
    },
  ];

  it('copies the reply text', async () => {
    const { getByLabelText } = render(<CloudCodeTranscript items={items} />);
    await act(async () => {
      fireEvent.press(getByLabelText('Copy reply'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith('Done. I updated the parser.');
  });

  it('shares the reply text', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { getByLabelText } = render(<CloudCodeTranscript items={items} />);
    await act(async () => {
      fireEvent.press(getByLabelText('Share reply'));
    });
    expect(share).toHaveBeenCalledWith({ message: 'Done. I updated the parser.' });
    share.mockRestore();
  });

  it('renders the changes card after the last item and opens the sheet from it', () => {
    const onOpenChanges = jest.fn();
    const { getByTestId, getByLabelText } = render(
      <CloudCodeTranscript items={items} changes={changesWith(4)} onOpenChanges={onOpenChanges} />,
    );
    expect(getByTestId('cloud-code-changes-card')).toBeTruthy();
    fireEvent.press(getByLabelText('View 1 more file'));
    expect(onOpenChanges).toHaveBeenCalled();
  });
});

describe('CloudCodeComposer', () => {
  const base = {
    value: '',
    working: false,
    stopping: false,
    detail: 'Model',
    optionsLabel: 'Task options and usage',
    onChangeText: jest.fn(),
    onSend: jest.fn(),
    onStop: jest.fn(),
    onOpenOptions: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('appends dictated text to the draft', () => {
    const { getByTestId, rerender } = render(<CloudCodeComposer {...base} />);
    fireEvent.press(getByTestId('voice-input-button'));
    expect(base.onChangeText).toHaveBeenLastCalledWith('add a test');
    rerender(<CloudCodeComposer {...base} value="Fix the bug" />);
    fireEvent.press(getByTestId('voice-input-button'));
    expect(base.onChangeText).toHaveBeenLastCalledWith('Fix the bug add a test');
  });

  it('shows the totals pill only when files changed and opens the sheet from it', () => {
    const onOpenChanges = jest.fn();
    const { queryByTestId, getByTestId, rerender, getByText } = render(
      <CloudCodeComposer {...base} changes={null} onOpenChanges={onOpenChanges} />,
    );
    expect(queryByTestId('cloud-code-changes-pill')).toBeNull();
    rerender(
      <CloudCodeComposer {...base} changes={changesWith(2)} onOpenChanges={onOpenChanges} />,
    );
    expect(getByText('2 files')).toBeTruthy();
    fireEvent.press(getByTestId('cloud-code-changes-pill'));
    expect(onOpenChanges).toHaveBeenCalledTimes(1);
  });
});

describe('CloudCodeChangesSheet counts', () => {
  const session = {
    id: 's1',
    state: 'ready',
    archivedAt: null,
    repositoryUrl: 'https://github.com/acme/app',
    workingBranch: 'agi/work',
    baseBranch: 'main',
    repositoryBranch: 'main',
    pullRequestUrl: null,
  } as unknown as CloudCodeChanges['session'];

  const view = {
    changes: changesWith(2),
    loading: false,
    busy: null,
    error: null,
    notice: null,
    refresh: jest.fn(),
    commit: jest.fn(),
    discard: jest.fn(),
    createPullRequest: jest.fn(),
    runCommand: jest.fn(),
    loadPullRequestStatus: jest.fn().mockResolvedValue({}),
    dismissError: jest.fn(),
  };

  it('shows the file total in the header and per-file counts on each row', () => {
    const { getByTestId, getByText, getAllByLabelText } = render(
      <CloudCodeChangesSheet
        visible
        session={session}
        entries={[]}
        view={view as never}
        onClose={jest.fn()}
      />,
    );
    expect(getByText('2 files changed')).toBeTruthy();
    expect(getByTestId('cloud-code-changes-totals')).toBeTruthy();
    expect(getAllByLabelText('5 lines added, 2 lines removed')).toHaveLength(1);
    expect(getAllByLabelText('3 lines added, 2 lines removed')).toHaveLength(1);
    expect(getAllByLabelText('2 lines added, 0 lines removed')).toHaveLength(1);
  });
});
