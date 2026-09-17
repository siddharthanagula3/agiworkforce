import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl } from '../SegmentedControl';

const OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'all', label: 'All' },
  { value: 'archived', label: 'Archived' },
] as const;

describe('SegmentedControl', () => {
  it('exposes a labelled group whose selected segment is pressed', () => {
    render(
      <SegmentedControl
        aria-label="Filter"
        options={OPTIONS}
        value="all"
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Filter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Active' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('reports the chosen value', () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Filter"
        options={OPTIONS}
        value="active"
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(onValueChange).toHaveBeenCalledWith('archived');
  });

  it('moves focus between segments with the arrow keys, wrapping at the ends', () => {
    render(
      <SegmentedControl
        aria-label="Filter"
        options={OPTIONS}
        value="active"
        onValueChange={vi.fn()}
      />,
    );

    const active = screen.getByRole('button', { name: 'Active' });
    active.focus();
    fireEvent.keyDown(active, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'All' }));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Archived' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(active);
  });
});
