import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardTitle } from '../Card';

describe('Card', () => {
  it('renders a div by default', () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId('card').tagName).toBe('DIV');
  });

  it('renders a semantic element via the as prop', () => {
    render(
      <Card as="article" aria-label="Report">
        content
      </Card>,
    );
    const el = screen.getByRole('article', { name: 'Report' });
    expect(el.tagName).toBe('ARTICLE');
  });

  it('renders CardTitle at the requested heading level', () => {
    render(<CardTitle as="h2">Title</CardTitle>);
    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeTruthy();
  });

  it('defaults CardTitle to an h3', () => {
    render(<CardTitle>Title</CardTitle>);
    expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toBeTruthy();
  });
});
