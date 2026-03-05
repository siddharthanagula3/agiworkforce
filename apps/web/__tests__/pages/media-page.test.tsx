/**
 * MediaPage Unit Tests
 *
 * Tests the "Coming Soon" media studio placeholder page.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const iconFactory = (name: string) => {
    const Icon = (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    Film: iconFactory('Film'),
    Sparkles: iconFactory('Sparkles'),
  };
});

import MediaPage from '@/app/dashboard/media/page';

describe('MediaPage', () => {
  it('renders "Media Studio" heading', () => {
    render(<MediaPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Media Studio');
  });

  it('renders "Coming Soon" badge', () => {
    render(<MediaPage />);

    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<MediaPage />);

    expect(
      screen.getByText(/Generate images, videos, and creative media with AI/),
    ).toBeInTheDocument();
  });
});
