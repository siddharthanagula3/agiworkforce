/**
 * DashboardHomePage Unit Tests
 *
 * Tests the dashboard landing page: greeting, stat cards, empty states, quick actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// --- Mocks ---

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'test-user', name: 'Test User', email: 'test@example.com' },
  })),
}));

vi.mock('@shared/stores/workforce-store', () => ({
  useWorkforceStore: vi.fn(() => ({
    hiredEmployees: [],
    fetchHiredEmployees: vi.fn(),
  })),
}));

vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// Mock ErrorBoundary to just render children
vi.mock('@shared/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock lucide-react icons as simple spans with data-testid
vi.mock('lucide-react', () => {
  const iconFactory = (name: string) => {
    const Icon = (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    MessageSquare: iconFactory('MessageSquare'),
    Sparkles: iconFactory('Sparkles'),
    Users: iconFactory('Users'),
    Image: iconFactory('Image'),
    ArrowRight: iconFactory('ArrowRight'),
    ArrowUpRight: iconFactory('ArrowUpRight'),
    ArrowDownRight: iconFactory('ArrowDownRight'),
    Activity: iconFactory('Activity'),
    CreditCard: iconFactory('CreditCard'),
    Zap: iconFactory('Zap'),
    Clock: iconFactory('Clock'),
    TrendingUp: iconFactory('TrendingUp'),
  };
});

// Mock UI components
vi.mock('@shared/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@shared/ui/progress', () => ({
  Progress: (props: Record<string, unknown>) => (
    <div role="progressbar" aria-label={props['aria-label'] as string} />
  ),
}));

// Import the component under test AFTER all mocks are set up
import { DashboardHomePage } from '@features/pages/DashboardHome';

describe('DashboardHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders greeting with user name', () => {
    render(<DashboardHomePage />);

    // The component shows "Good morning/afternoon/evening, Test User"
    expect(screen.getByText('Test User')).toBeInTheDocument();
    // Check the greeting part exists (time-dependent, so just verify the comma pattern)
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toMatch(/Good (morning|afternoon|evening),\s+Test User/);
  });

  it('renders all 4 stat cards with labels', () => {
    render(<DashboardHomePage />);

    expect(screen.getByText('Tokens Used')).toBeInTheDocument();
    expect(screen.getByText('Credits Remaining')).toBeInTheDocument();
    expect(screen.getByText('Active Skills')).toBeInTheDocument();
    expect(screen.getByText('Sessions This Week')).toBeInTheDocument();
  });

  it('renders "No conversations yet" empty state', async () => {
    render(<DashboardHomePage />);

    // The component starts with convoLoading=true, then async fetch resolves with no data
    await waitFor(() => {
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });
    expect(screen.getByText('Start your first chat')).toBeInTheDocument();
  });

  it('renders quick action cards', () => {
    render(<DashboardHomePage />);

    expect(screen.getByText('New Chat')).toBeInTheDocument();
    expect(screen.getByText('Open VIBE')).toBeInTheDocument();
    expect(screen.getByText('Browse Skills')).toBeInTheDocument();
    expect(screen.getByText('Media Studio')).toBeInTheDocument();

    // Check descriptions are present
    expect(screen.getByText('Start a conversation with any AI model')).toBeInTheDocument();
    expect(screen.getByText('Visual IDE and build environment')).toBeInTheDocument();
    expect(screen.getByText('AI specialists for any task')).toBeInTheDocument();
    expect(screen.getByText('Generate images, video, and audio')).toBeInTheDocument();
  });

  it('renders "No skills hired yet" empty state', () => {
    render(<DashboardHomePage />);

    expect(screen.getByText('No skills hired yet')).toBeInTheDocument();
    // The "Browse skills" link inside the empty state section
    expect(screen.getByText('Browse skills')).toBeInTheDocument();
  });
});
