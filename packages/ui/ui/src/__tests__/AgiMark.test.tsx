import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgiMark } from '../AgiMark';

describe('AgiMark loading usage', () => {
  it('preserves accessible labels and DOM hooks when replacing a loading icon', () => {
    render(<AgiMark spinning data-testid="pending-mark" aria-label="Loading models" />);
    const mark = screen.getByTestId('pending-mark');
    expect(mark.getAttribute('aria-label')).toBe('Loading models');
    expect(mark.getAttribute('alt')).toBe('Loading models');
    expect(mark.getAttribute('aria-hidden')).toBeNull();
    expect(mark.classList.contains('agi-mark-spin')).toBe(true);
  });

  it('keeps ordinary brand marks decorative and still', () => {
    render(<AgiMark data-testid="brand-mark" />);
    const mark = screen.getByTestId('brand-mark');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('alt')).toBe('');
    expect(mark.classList.contains('agi-mark-spin')).toBe(false);
    expect(mark.closest('.agi-mark-motion')).toBeNull();
  });

  it('keeps one accessible image while the decorative ribbon light circulates', () => {
    const { container } = render(<AgiMark spinning ariaLabel="AGIWORKFORCE" />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img').getAttribute('alt')).toBe('AGIWORKFORCE');
    expect(container.querySelectorAll('.agi-mark-ribbon')).toHaveLength(1);
    for (const facet of container.querySelectorAll('.agi-mark-ribbon')) {
      expect(facet.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
