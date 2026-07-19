import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InputFooter } from './InputFooter';

describe('InputFooter', () => {
  it('renders only a usage percentage, not raw credits', () => {
    render(<InputFooter usedCredits={25} totalCredits={100} />);

    expect(screen.getByText('25% used')).toBeTruthy();
    expect(screen.queryByText('25/100')).toBeNull();
  });
});
