/**
 * MediaPage Unit Tests
 *
 * Tests the Media Studio page with image and video generation UI.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
    ImageIcon: iconFactory('ImageIcon'),
    Sparkles: iconFactory('Sparkles'),
    Loader2: iconFactory('Loader2'),
    Download: iconFactory('Download'),
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock shared UI components used by the page
vi.mock('@shared/ui/button', () => ({
  Button: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@shared/ui/textarea', () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock('@shared/ui/label', () => ({
  Label: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock('@shared/ui/tabs', () => ({
  Tabs: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  TabsContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('@shared/ui/select', () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <option>{children}</option>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  SelectValue: () => <span />,
}));

vi.mock('@shared/ui/card', () => ({
  Card: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <h3>{children}</h3>,
}));

import MediaPage from '@/app/dashboard/media/page';

describe('MediaPage', () => {
  it('renders "Media Studio" heading', () => {
    render(<MediaPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Media Studio');
  });

  it('renders description text about generating images and videos', () => {
    render(<MediaPage />);

    expect(screen.getByText(/Generate images and videos with AI/)).toBeInTheDocument();
  });

  it('renders provider info cards', () => {
    render(<MediaPage />);

    expect(screen.getByText('Image providers')).toBeInTheDocument();
    expect(screen.getByText('Video providers')).toBeInTheDocument();
    expect(screen.getByText('Requirements')).toBeInTheDocument();
  });
});
