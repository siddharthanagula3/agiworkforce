import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InlineSourceTags, type Citation } from './InlineSourceTags';

const citations: Citation[] = [
  {
    index: 1,
    url: 'https://www.nodejs.org/en/blog/release',
    title: 'Node.js release notes',
    snippet: 'The maintenance window for this line closes in April.',
  },
  { index: 2, url: 'not-a-url', title: 'Offline handout' },
];

describe('InlineSourceTags', () => {
  it('reveals a source card with host, title and snippet on hover', async () => {
    const user = userEvent.setup();
    render(<InlineSourceTags citations={citations} />);

    expect(screen.queryByTestId('inline-source-card-1')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('link', { name: 'Source 1: Node.js release notes' }));

    const card = screen.getByTestId('inline-source-card-1');
    expect(card).toHaveTextContent('nodejs.org');
    expect(card).toHaveTextContent('Node.js release notes');
    expect(card).toHaveTextContent('The maintenance window for this line closes in April.');
    expect(card.querySelector('img')).toHaveAttribute(
      'src',
      'https://www.google.com/s2/favicons?domain=www.nodejs.org&sz=32',
    );
  });

  it('reveals the same card on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<InlineSourceTags citations={citations} />);

    await user.tab();

    expect(screen.getByTestId('inline-source-card-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source 1: Node.js release notes' })).toHaveAttribute(
      'aria-describedby',
      screen.getByTestId('inline-source-card-1').id,
    );
  });

  it('falls back to a globe and the raw value when the url has no host', async () => {
    const user = userEvent.setup();
    render(<InlineSourceTags citations={citations} />);

    await user.hover(screen.getByRole('link', { name: 'Source 2: Offline handout' }));

    const card = screen.getByTestId('inline-source-card-2');
    expect(card.querySelector('img')).toBeNull();
    expect(card).toHaveTextContent('not-a-url');
  });
});
