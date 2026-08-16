
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ToolLabelEntry } from '../ToolLabel';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.ComponentProps<'span'>) => (
      <span {...props}>{children}</span>
    ),
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

    expect(screen.getByText('Read')).toBeInTheDocument();
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
