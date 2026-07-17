import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadioGroup, RadioGroupItem } from '../RadioGroup';

describe('RadioGroup', () => {
  it('renders items without crashing', () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" aria-label="Option A" />
        <RadioGroupItem value="b" aria-label="Option B" />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeTruthy();
  });
});
