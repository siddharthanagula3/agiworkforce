import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ThinkingBlock } from '../ThinkingBlock';

describe('ThinkingBlock provider reasoning', () => {
  it('renders a familiar collapsed duration summary and expands sanitized markdown reasoning', () => {
    render(
      <ThinkingBlock
        block={{
          id: 'reasoning-1',
          summary: 'Thought for 27.3 seconds',
          collapsed: true,
          durationMs: 27_300,
          steps: [
            {
              id: 'reasoning-step',
              type: 'thinking',
              content: '**Analyze the request**\n\n- Choose a concise answer.',
            },
            { id: 'done-step', type: 'done', content: 'Done' },
          ],
        }}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Thought for 27.3 seconds' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Analyze the request')).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Analyze the request').tagName).toBe('STRONG');
    expect(screen.getByText('Choose a concise answer.')).toBeDefined();
  });
});
