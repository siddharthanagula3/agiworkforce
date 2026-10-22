import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArticleSupportCards } from './ArticleSupportCards';

describe('help article support and related cards', () => {
  it('links both support cards to routes that exist', () => {
    render(<ArticleSupportCards related={[]} />);

    const section = screen.getByRole('region', { name: 'Need more help?' });
    const links = within(section).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/support', '/contact']);
  });

  it('lists the related articles it is given, in order, as links', () => {
    render(
      <ArticleSupportCards
        related={[
          { href: '/help/a', title: 'First article' },
          { href: '/help/b', title: 'Second article' },
          { href: '/help/c', title: 'Third article' },
        ]}
      />,
    );

    const section = screen.getByRole('region', { name: 'Related articles' });
    const links = within(section).getAllByRole('link');
    expect(links.map((link) => [link.getAttribute('href'), link.textContent])).toEqual([
      ['/help/a', 'First article'],
      ['/help/b', 'Second article'],
      ['/help/c', 'Third article'],
    ]);
  });

  it('omits the related heading when the article has no siblings', () => {
    render(<ArticleSupportCards related={[]} />);

    expect(screen.queryByRole('heading', { name: 'Related articles' })).not.toBeInTheDocument();
  });
});
