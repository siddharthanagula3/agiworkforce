import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '../theme-toggle';

// Mock next-themes
const mockSetTheme = vi.fn();
let mockTheme = 'system';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockTheme = 'system';
  });

  it('renders a button with aria-label indicating the current theme', () => {
    mockTheme = 'system';
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Switch theme (currently System)');
  });

  it('cycles from light to dark on click', () => {
    mockTheme = 'light';
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Switch theme (currently Light)');
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('cycles from dark to system on click', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Switch theme (currently Dark)');
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('cycles from system to light on click', () => {
    mockTheme = 'system';
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('shows a title attribute describing the current theme', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'Current theme: Dark. Click to cycle through themes.');
  });

  it('renders an icon for each theme state', () => {
    const { rerender } = render(<ThemeToggle />);

    // system → monitor icon (svg should be present)
    mockTheme = 'system';
    rerender(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    // light → sun icon
    mockTheme = 'light';
    rerender(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    // dark → moon icon
    mockTheme = 'dark';
    rerender(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
