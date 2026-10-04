import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PaneTitle } from '../PaneTitle';

describe('PaneTitle', () => {
  it('renders the page and pane title role as a level-1 heading', () => {
    render(<PaneTitle>Study</PaneTitle>);
    const heading = screen.getByRole('heading', { level: 1, name: 'Study' });
    expect(heading).toHaveClass('text-h1', 'text-foreground');
  });

  it('merges a caller class and forwards attributes', () => {
    render(
      <PaneTitle className="mb-1" id="pane-title" aria-describedby="pane-desc">
        Capabilities
      </PaneTitle>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Capabilities' });
    expect(heading).toHaveClass('mb-1', 'text-h1');
    expect(heading).toHaveAttribute('id', 'pane-title');
    expect(heading).toHaveAttribute('aria-describedby', 'pane-desc');
  });
});
