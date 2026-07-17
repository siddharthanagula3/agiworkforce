import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { ThemeToggle } from '../ThemeToggle';

describe('ThemeToggle', () => {
  it('renders without crashing inside a next-themes ThemeProvider', () => {
    render(
      <ThemeProvider attribute="class">
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
