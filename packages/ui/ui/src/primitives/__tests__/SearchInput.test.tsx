import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchInput } from '../SearchInput';

describe('SearchInput', () => {
  it('renders a labelled search field with a decorative icon', () => {
    const { container } = render(
      <SearchInput aria-label="Search skills" value="" onChange={vi.fn()} />,
    );

    const input = screen.getByRole('searchbox', { name: 'Search skills' });
    expect(input.getAttribute('type')).toBe('search');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('forwards changes and keeps the caller container classes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchInput aria-label="Search" containerClassName="w-48" size="sm" onChange={onChange} />,
    );

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'git' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild?.className).toContain('w-48');
    expect(screen.getByRole('searchbox').className).toContain('h-8');
  });
});
