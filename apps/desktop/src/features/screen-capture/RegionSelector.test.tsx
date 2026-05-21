import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RegionSelector } from './RegionSelector';

describe('RegionSelector', () => {
  it('renders in a portal attached to document.body', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const { container } = render(<RegionSelector onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText('Click and drag to select a region')).toBeTruthy();
    expect(container.querySelector('.cursor-crosshair')).toBeNull();
    expect(document.body.querySelector('.cursor-crosshair')).toBeTruthy();
  });
});
