import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PolicyContents, policySectionId } from '../PolicyContents';

describe('policySectionId', () => {
  it('derives s-<number> for a numbered eyebrow', () => {
    expect(policySectionId('07 · Your rights, and how to use them')).toBe('s-07');
  });

  it('slugifies a non-numbered eyebrow', () => {
    expect(policySectionId('The short version')).toBe('s-the-short-version');
  });
});

describe('PolicyContents', () => {
  it('links a numbered string section to its derived s-<number> anchor', () => {
    render(<PolicyContents sections={['01 · Who we are']} />);

    expect(screen.getByRole('link', { name: '01 · Who we are' })).toHaveAttribute('href', '#s-01');
  });

  it('links an explicit {label, id} section to the id as given, not a derived slug', () => {
    render(<PolicyContents sections={[{ label: 'Reporting a vulnerability', id: 'report' }]} />);

    expect(screen.getByRole('link', { name: 'Reporting a vulnerability' })).toHaveAttribute(
      'href',
      '#report',
    );
  });

  it('renders a mix of numbered strings and explicit sections in order', () => {
    render(
      <PolicyContents sections={[{ label: 'Summary', id: 'summary' }, '01 · What this covers']} />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Summary', '01 · What this covers']);
    expect(links[0]).toHaveAttribute('href', '#summary');
    expect(links[1]).toHaveAttribute('href', '#s-01');
  });
});
