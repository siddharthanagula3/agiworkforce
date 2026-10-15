import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CalculationCard } from './CalculationCard';

describe('CalculationCard derived result', () => {
  it('derives the result from the last aligned row without leaking environment tags', () => {
    const { container } = render(
      <CalculationCard content={'$$\\begin{aligned} a &= 1 + 1 \\\\ b &= 3\\end{aligned}$$'} />,
    );

    expect(container.textContent).not.toContain('\\end{aligned}');
    expect(container.textContent).not.toContain('\\begin');
    expect(screen.getByText('Result')).toBeInTheDocument();
    const result = container.querySelector('.mt-1.text-2xl');
    expect(result?.textContent).toContain('3');
  });
});
