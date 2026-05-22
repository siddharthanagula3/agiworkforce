/**
 * ToolTimeline File-Op Structured Display Tests
 *
 * Covers:
 * - File-op rows (Write/Edit) show extension badge (e.g., "RS", "HTML")
 * - File-op rows show the basename, not the full path
 * - Diff +N / -N counts are rendered for completed edit entries
 * - Non-file-op tools (Read, Bash) fall through to the default row layout
 * - Snapshot: a completed Edit entry with a diff
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ToolLabelEntry } from '../ToolLabel';

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ToolLabel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ToolLabel')>();
  return actual;
});

import { ToolTimeline } from '../ToolTimeline';

const sampleDiff = [
  '--- a/src/main.rs',
  '+++ b/src/main.rs',
  '@@ -1,3 +1,5 @@',
  ' fn main() {',
  '+    println!("hello");',
  '+    println!("world");',
  '-    // placeholder',
  ' }',
].join('\n');

describe('ToolTimeline — file-op structured rows', () => {
  it('shows extension badge for an Edit entry', async () => {
    const user = (await import('@testing-library/user-event')).default;
    const setup = user.setup();
    const entries: ToolLabelEntry[] = [
      {
        id: 'e1',
        displayName: 'Edit',
        displayArgs: 'src/main.rs',
        status: 'completed',
        resultPreview: sampleDiff,
        durationMs: 120,
      },
    ];

    render(<ToolTimeline entries={entries} />);
    await setup.click(screen.getByRole('button'));

    // Extension badge
    expect(screen.getByText('RS')).toBeInTheDocument();
  });

  it('shows the basename (not full path) for a Write entry', async () => {
    const user = (await import('@testing-library/user-event')).default;
    const setup = user.setup();
    const entries: ToolLabelEntry[] = [
      {
        id: 'w1',
        displayName: 'Write',
        displayArgs: 'apps/desktop/src/features/chat/NewFile.html',
        status: 'completed',
        resultPreview: '+<html>\n+</html>',
        durationMs: 80,
      },
    ];

    render(<ToolTimeline entries={entries} />);
    await setup.click(screen.getByRole('button'));

    expect(screen.getByText('NewFile.html')).toBeInTheDocument();
    expect(
      screen.queryByText('apps/desktop/src/features/chat/NewFile.html'),
    ).not.toBeInTheDocument();
  });

  it('shows +N / -N diff counts for a completed Edit entry with a diff', async () => {
    const user = (await import('@testing-library/user-event')).default;
    const setup = user.setup();
    const entries: ToolLabelEntry[] = [
      {
        id: 'e2',
        displayName: 'Edit',
        displayArgs: 'src/main.rs',
        status: 'completed',
        resultPreview: sampleDiff,
        durationMs: 100,
      },
    ];

    render(<ToolTimeline entries={entries} />);
    await setup.click(screen.getByRole('button'));

    // sampleDiff has 2 additions and 1 removal
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('falls back to default row for a Read entry (not a file-op)', async () => {
    const user = (await import('@testing-library/user-event')).default;
    const setup = user.setup();
    const entries: ToolLabelEntry[] = [
      {
        id: 'r1',
        displayName: 'Read',
        displayArgs: 'src/lib.rs',
        status: 'completed',
        durationMs: 30,
      },
    ];

    render(<ToolTimeline entries={entries} />);
    await setup.click(screen.getByRole('button'));

    // Should show the display name as text (default row layout), not an extension badge
    expect(screen.getByText('Read')).toBeInTheDocument();
    // Extension badge "RS" should NOT appear because Read is not a write/edit op
    expect(screen.queryByText('RS')).not.toBeInTheDocument();
  });

  it('matches snapshot for a completed Edit entry', async () => {
    const user = (await import('@testing-library/user-event')).default;
    const setup = user.setup();
    const entries: ToolLabelEntry[] = [
      {
        id: 'snap-1',
        displayName: 'Edit',
        displayArgs: 'src/main.rs',
        status: 'completed',
        resultPreview: sampleDiff,
        durationMs: 120,
      },
    ];

    const { container } = render(<ToolTimeline entries={entries} />);
    await setup.click(screen.getByRole('button'));
    expect(container.firstChild).toMatchSnapshot();
  });
});
