import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock: framer-motion motion proxy
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { ThinkingBlock } from '../ThinkingBlock';

describe('ThinkingBlock', () => {
  it('renders reasoning text without a fake blinking cursor', () => {
    const { container } = render(
      <ThinkingBlock content={'Step 1\nStep 2'} isStreaming={true} defaultExpanded={true} />,
    );

    expect(screen.getByText('Reasoning')).toBeInTheDocument();
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
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
});
