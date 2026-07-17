import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from '../Slider';

describe('Slider', () => {
  it('renders a thumb with an accessible name', () => {
    render(<Slider defaultValue={[25]} max={100} step={1} />);
    expect(screen.getByRole('slider', { name: 'Slider thumb' })).toBeTruthy();
  });

  it('exposes valueLabel as aria-valuetext on the thumb', () => {
    render(<Slider defaultValue={[50]} max={100} step={1} valueLabel="50 percent" />);
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('50 percent');
  });
});
