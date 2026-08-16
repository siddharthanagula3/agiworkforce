import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: framer-motion motion proxy
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { ThinkingBlock, ThinkingBlockFlow } from '../ThinkingBlock';

describe('ThinkingBlock', () => {
  it('renders reasoning text without a fake blinking cursor', () => {
    const { container } = render(
      <ThinkingBlock content={'Step 1\nStep 2'} isStreaming={true} defaultExpanded={true} />,
    );

    expect(screen.getByText('Thinking…')).toBeInTheDocument();
    expect(container.querySelector('p')?.textContent).toBe('Step 1\nStep 2');
    expect(container.querySelector('.animate-blink')).toBeNull();
  });

  it('shows a collapsed preview without a blinking cursor', () => {
    const { container } = render(
      <ThinkingBlock
        content={'First meaningful line\nSecond line'}
        isStreaming={false}
        defaultExpanded={false}
      />,
    );

    expect(screen.getByText('First meaningful line')).toBeInTheDocument();
    expect(screen.getByText('Thought')).toBeInTheDocument();
    expect(container.querySelector('.animate-blink')).toBeNull();
  });

  it('uses clock icon instead of brain icon', () => {
    const { container } = render(
      <ThinkingBlock content="thinking..." isStreaming={false} defaultExpanded={false} />,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders blockIndex as "Thought N" label', () => {
    render(
      <ThinkingBlock
        content="reasoning content"
        isStreaming={false}
        defaultExpanded={false}
        blockIndex={2}
      />,
    );
    expect(screen.getByText('Thought 3')).toBeInTheDocument();
  });

  it('shows "Thinking…" when streaming with no blockIndex', () => {
    render(
      <ThinkingBlock
        content="partial reasoning"
        isStreaming={true}
        defaultExpanded={true}
        blockIndex={undefined}
      />,
    );
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('expands on click to show content body', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ThinkingBlock content="hidden content" isStreaming={false} defaultExpanded={false} />,
    );

    expect(container.querySelector('p')).toBeNull();
    await user.click(screen.getByRole('button', { name: /expand reasoning/i }));
    expect(container.querySelector('p')?.textContent).toBe('hidden content');
  });

  it('collapses on click to hide content body', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ThinkingBlock content="visible content" isStreaming={false} defaultExpanded={true} />,
    );

    expect(container.querySelector('p')?.textContent).toBe('visible content');
    await user.click(screen.getByRole('button', { name: /collapse reasoning/i }));
    expect(container.querySelector('p')).toBeNull();
  });

  it('returns null for empty content', () => {
    const { container } = render(<ThinkingBlock content="" isStreaming={false} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ThinkingBlockFlow', () => {
  it('renders nothing when blocks array is empty', () => {
    const { container } = render(<ThinkingBlockFlow blocks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single ThinkingBlock directly for one-block flow', () => {
    render(
      <ThinkingBlockFlow
        blocks={[{ content: 'solo thought', isStreaming: false }]}
        defaultExpanded={true}
      />,
    );
    expect(screen.getByText('solo thought')).toBeInTheDocument();
    expect(screen.queryByText('Thought 1')).not.toBeInTheDocument();
  });

  it('renders all blocks with numbered labels for multi-block flow', () => {
    render(
      <ThinkingBlockFlow
        blocks={[
          { content: 'first thought', isStreaming: false },
          { content: 'second thought', isStreaming: false },
          { content: 'third thought', isStreaming: true },
        ]}
        defaultExpanded={false}
      />,
    );
    expect(screen.getByText('Thought 1')).toBeInTheDocument();
    expect(screen.getByText('Thought 2')).toBeInTheDocument();
    expect(screen.getByText('Thought 3')).toBeInTheDocument();
  });

  it('only last block is expanded by default in multi-block flow', () => {
    const { container } = render(
      <ThinkingBlockFlow
        blocks={[
          { content: 'first content', isStreaming: false },
          { content: 'last content', isStreaming: true },
        ]}
        defaultExpanded={true}
      />,
    );
    expect(screen.getByText('last content')).toBeInTheDocument();
    const bodyParagraphs = container.querySelectorAll('p');
    const bodyTexts = Array.from(bodyParagraphs).map((p) => p.textContent);
    expect(bodyTexts).not.toContain('first content');
  });

  it('renders connector line for multi-block flow', () => {
    const { container } = render(
      <ThinkingBlockFlow
        blocks={[
          { content: 'block one', isStreaming: false },
          { content: 'block two', isStreaming: false },
        ]}
      />,
    );
    expect(container.querySelector('.absolute')).toBeTruthy();
  });
});
