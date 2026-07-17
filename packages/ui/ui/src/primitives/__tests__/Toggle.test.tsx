import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toggle } from '../Toggle';

describe('Toggle', () => {
  it('renders without crashing', () => {
    render(<Toggle aria-label="bold">B</Toggle>);
    expect(screen.getByRole('button', { name: 'bold' })).toBeTruthy();
  });
});
