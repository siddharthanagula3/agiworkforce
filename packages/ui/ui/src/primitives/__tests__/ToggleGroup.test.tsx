import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToggleGroup, ToggleGroupItem } from '../ToggleGroup';

describe('ToggleGroup', () => {
  it('renders items without crashing', () => {
    render(
      <ToggleGroup type="single" defaultValue="a">
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="Option B">
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeTruthy();
  });
});
