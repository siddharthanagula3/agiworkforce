import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GitDiffViewer } from '@/features/git/GitDiffViewer';
import { invoke } from '@/lib/tauri-mock';

const mockInvoke = vi.mocked(invoke);

const DIFF = {
  file_path: 'src/retry.ts',
  additions: 1,
  deletions: 1,
  diff_content: [
    '@@ -1,2 +1,2 @@',
    ' const name = "retry";',
    '-const attempts = 3;',
    '+const attempts = 5;',
  ].join('\n'),
};

describe('GitDiffViewer, what a screen reader is told', () => {
  it('states each line as added, removed or unchanged rather than leaving it to colour', async () => {
    mockInvoke.mockResolvedValue([DIFF]);

    render(<GitDiffViewer repoPath="/repo" />);

    await waitFor(() => expect(screen.getByText('src/retry.ts')).toBeInTheDocument());

    expect(screen.getByText('Added line 2')).toBeInTheDocument();
    expect(screen.getByText('Removed line')).toBeInTheDocument();
    expect(screen.getByText('Unchanged line 1')).toBeInTheDocument();
    expect(screen.getByText('1 added, 1 removed')).toBeInTheDocument();
  });
});
