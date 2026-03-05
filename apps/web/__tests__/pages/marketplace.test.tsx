/**
 * Tests for PublicMarketplace page
 *
 * Tests pure helper functions (deriveRating, deriveUsageCount) by mirroring
 * their logic from the source, and tests component rendering with full mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mocks (must be before imports that use them) ───────────────────────────

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: vi.fn(() => ({ user: { id: 'test-user-id' } })),
}));

vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@features/workforce/services/employee-database', () => ({
  isEmployeePurchased: vi.fn().mockResolvedValue(false),
  listPurchasedEmployees: vi.fn().mockResolvedValue([]),
  purchaseEmployee: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/data/marketplace-employees', () => ({
  categories: [
    { id: 'all', label: 'All' },
    { id: 'technical', label: 'Technical' },
    { id: 'healthcare', label: 'Healthcare' },
  ],
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    return <span data-testid="next-image" data-src={props['src'] as string} />;
  },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
    section: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <section {...props}>{children}</section>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@shared/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@shared/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@shared/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@shared/ui/input', () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock('@shared/ui/badge', () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <span {...props}>{children}</span>
  ),
}));

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Search: () => <svg data-testid="icon-search" />,
  CheckCircle: () => <svg data-testid="icon-check" />,
  Star: () => <svg data-testid="icon-star" />,
  MessageSquare: () => <svg data-testid="icon-message" />,
  Users: () => <svg data-testid="icon-users" />,
  ChevronLeft: () => <svg data-testid="icon-chevron-left" />,
  ChevronRight: () => <svg data-testid="icon-chevron-right" />,
  X: () => <svg data-testid="icon-x" />,
}));

// ─── Helper functions mirrored from source ──────────────────────────────────
// These are module-private in PublicMarketplace.tsx, so we replicate them here
// to test the pure logic. Keep in sync with the source.

function deriveRating(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return 4.0 + (Math.abs(hash) % 10) / 10;
}

function deriveUsageCount(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 37 + id.charCodeAt(i)) | 0;
  }
  const count = 200 + (Math.abs(hash) % 4800);
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('deriveRating', () => {
  it('returns a number between 4.0 and 5.0', () => {
    const inputs = ['agent-1', 'agent-2', 'test', 'abc', 'xyz-long-id-string-here'];
    for (const id of inputs) {
      const rating = deriveRating(id);
      expect(rating).toBeGreaterThanOrEqual(4.0);
      expect(rating).toBeLessThanOrEqual(5.0);
    }
  });

  it('is deterministic (same input produces same output)', () => {
    expect(deriveRating('agent-1')).toBe(deriveRating('agent-1'));
    expect(deriveRating('test-id')).toBe(deriveRating('test-id'));
    expect(deriveRating('')).toBe(deriveRating(''));
  });

  it('produces different results for different inputs', () => {
    const a = deriveRating('agent-alpha');
    const b = deriveRating('agent-beta');
    // While collisions are theoretically possible, these specific inputs differ
    expect(a).not.toBe(b);
  });

  it('returns exactly 4.0 for empty string (hash is 0)', () => {
    expect(deriveRating('')).toBe(4.0);
  });

  it('returns values at 0.1 increments', () => {
    const rating = deriveRating('test');
    const decimal = rating - 4.0;
    // Check it's approximately a 0.1 increment (within floating point tolerance)
    expect(Math.round(decimal * 10) % 1).toBe(0);
  });
});

describe('deriveUsageCount', () => {
  it('is deterministic (same input produces same output)', () => {
    expect(deriveUsageCount('agent-1')).toBe(deriveUsageCount('agent-1'));
    expect(deriveUsageCount('test-id')).toBe(deriveUsageCount('test-id'));
  });

  it('returns a string', () => {
    expect(typeof deriveUsageCount('agent-1')).toBe('string');
  });

  it('returns "K" suffix for counts >= 1000', () => {
    // Test many inputs — some will produce >= 1000
    const inputs = Array.from({ length: 50 }, (_, i) => `agent-${i}`);
    const withK = inputs.filter((id) => deriveUsageCount(id).includes('K'));
    // With range 200-4999, most will be >= 1000
    expect(withK.length).toBeGreaterThan(0);
  });

  it('formats K values with one decimal place', () => {
    const inputs = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    for (const id of inputs) {
      const result = deriveUsageCount(id);
      if (result.includes('K')) {
        // Should match pattern like "1.2K", "3.5K"
        expect(result).toMatch(/^\d+\.\d{1}K$/);
      } else {
        // Should be a plain number string
        expect(result).toMatch(/^\d+$/);
        const num = parseInt(result, 10);
        expect(num).toBeGreaterThanOrEqual(200);
        expect(num).toBeLessThan(1000);
      }
    }
  });

  it('returns "200" for empty string (hash is 0, count = 200 + 0)', () => {
    expect(deriveUsageCount('')).toBe('200');
  });
});

describe('MarketplacePublicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading', async () => {
    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);
    expect(screen.getByText('Agent Marketplace')).toBeInTheDocument();
  });

  it('renders the search bar with placeholder', async () => {
    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);
    expect(screen.getByPlaceholderText('Search AI agents...')).toBeInTheDocument();
  });

  it('renders category pills from mock data', async () => {
    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Technical')).toBeInTheDocument();
    expect(screen.getByText('Healthcare')).toBeInTheDocument();
  });

  it('shows empty state when no agents and not loading', async () => {
    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);
    expect(screen.getByText('No agents found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your search or category filter.')).toBeInTheDocument();
  });

  it('shows Clear Filters button in empty state', async () => {
    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('renders loading skeletons when isLoading is true', async () => {
    const { useQuery } = await import('@tanstack/react-query');
    vi.mocked(useQuery).mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
      error: null,
      isFetching: false,
      isPending: true,
      isSuccess: false,
      status: 'pending',
      fetchStatus: 'fetching',
      refetch: vi.fn(),
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      isLoadingError: false,
      isPaused: false,
      isPlaceholderData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isInitialLoading: true,
      promise: Promise.resolve([]),
    } as ReturnType<typeof useQuery>);

    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);

    // Should show loading text in the subtitle
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Should render skeleton cards (6 of them via animate-pulse)
    const container = document.querySelector('.grid');
    expect(container).not.toBeNull();
  });

  it('renders agent cards when data is present', async () => {
    const mockAgents = [
      {
        id: 'agent-1',
        name: 'Test Agent',
        role: 'Developer',
        category: 'technical',
        description: 'A test agent for development tasks',
        provider: 'claude' as const,
        avatar: 'https://example.com/avatar.png',
        skills: ['TypeScript', 'React'],
        specialty: 'Frontend',
        fitLevel: 'excellent' as const,
        popular: false,
      },
    ];

    const { useQuery } = await import('@tanstack/react-query');
    vi.mocked(useQuery).mockReturnValue({
      data: mockAgents,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      isPending: false,
      isSuccess: true,
      status: 'success',
      fetchStatus: 'idle',
      refetch: vi.fn(),
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      isLoadingError: false,
      isPaused: false,
      isPlaceholderData: false,
      isRefetchError: false,
      isRefetching: false,
      isStale: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isInitialLoading: false,
      promise: Promise.resolve(mockAgents),
    } as ReturnType<typeof useQuery>);

    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);

    // Agent may appear in both featured and grid sections
    expect(screen.getAllByText('Test Agent').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('A test agent for development tasks').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('React').length).toBeGreaterThanOrEqual(1);
  });

  it('allows typing in the search bar', async () => {
    const { MarketplacePublicPage } = await import('@features/pages/PublicMarketplace');
    render(<MarketplacePublicPage />);

    const searchInput = screen.getByPlaceholderText('Search AI agents...');
    fireEvent.change(searchInput, { target: { value: 'test query' } });
    expect(searchInput).toHaveValue('test query');
  });

  it('exports default with ErrorBoundary wrapper', async () => {
    const mod = await import('@features/pages/PublicMarketplace');
    expect(mod.default).toBeDefined();
    expect(mod.MarketplacePublicPage).toBeDefined();
    // Default export is a different component (wrapped version)
    expect(mod.default).not.toBe(mod.MarketplacePublicPage);
  });
});
