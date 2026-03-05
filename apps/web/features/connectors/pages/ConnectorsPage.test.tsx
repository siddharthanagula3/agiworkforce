/**
 * ConnectorsPage Component Tests
 *
 * Tests for the Connectors page: rendering, search filtering,
 * category tab switching, and connector count badges.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@shared/ui/button', () => {
  const Button = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
    ({ children, onClick, disabled, ...props }, ref) => (
      <button
        ref={ref}
        onClick={onClick as React.MouseEventHandler}
        disabled={disabled as boolean | undefined}
        {...props}
      >
        {children as React.ReactNode}
      </button>
    ),
  );
  Button.displayName = 'Button';
  return { Button };
});

vi.mock('@shared/ui/input', () => {
  const Input = React.forwardRef<HTMLInputElement, Record<string, unknown>>(
    ({ onChange, value, placeholder, ...props }, ref) => (
      <input
        ref={ref}
        onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
        value={value as string | undefined}
        placeholder={placeholder as string | undefined}
        {...props}
      />
    ),
  );
  Input.displayName = 'Input';
  return { Input };
});

vi.mock('@shared/ui/badge', () => {
  const Badge = ({ children, className, variant, ...props }: Record<string, unknown>) => (
    <span
      data-variant={variant as string | undefined}
      className={className as string | undefined}
      {...props}
    >
      {children as React.ReactNode}
    </span>
  );
  return { Badge };
});

// Mock all lucide-react icons used in ConnectorsPage
vi.mock('lucide-react', () => {
  const Icon = ({ className, ...props }: Record<string, unknown>) => (
    <span className={className as string | undefined} {...props} />
  );
  return {
    Search: Icon,
    Plus: Icon,
    Check: Icon,
    MoreHorizontal: Icon,
    Zap: Icon,
    Lock: Icon,
    ExternalLink: Icon,
    Loader2: Icon,
  };
});

// ─── Import under test ────────────────────────────────────────────────────────

import { ConnectorsPage } from './ConnectorsPage';

// ─── Helper: render with resolved loading state ──────────────────────────────

async function renderConnectorsPage() {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<ConnectorsPage />);
  });
  return result!;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConnectorsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch to resolve the /api/connectors call with empty connectors
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ connectors: [] }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1. Renders without crashing
  it('renders without crashing', async () => {
    const { container } = await renderConnectorsPage();
    expect(container).toBeDefined();
  });

  // 2. Displays "Connectors" heading
  it('displays the Connectors heading', async () => {
    await renderConnectorsPage();
    expect(screen.getByText('Connectors')).toBeDefined();
  });

  // 3. Shows the page description
  it('shows the page description', async () => {
    await renderConnectorsPage();
    expect(
      screen.getByText(
        'Connect your tools and give your AI agents access to the apps you use every day.',
      ),
    ).toBeDefined();
  });

  // 4. Shows connector count badges (connected + total)
  it('shows connected and total count badges', async () => {
    await renderConnectorsPage();
    // Default: 0 connected (connectors start unconnected)
    expect(screen.getByText('0 connected')).toBeDefined();
    // Total count badge: CONNECTORS.length
    expect(screen.getByText(/\d+ total/)).toBeDefined();
  });

  // 5. Shows "Connected" section header with count after connecting
  it('shows the Connected section when connectors are connected', async () => {
    await renderConnectorsPage();
    // Connect a connector first
    const connectButtons = screen.getAllByText('Connect');
    await act(async () => {
      fireEvent.click(connectButtons[0]!);
    });
    // The "Connected (1)" heading should now be visible
    expect(screen.getByText(/Connected \(\d+\)/)).toBeDefined();
  });

  // 6. Shows "Available" section header
  it('shows the Available section', async () => {
    await renderConnectorsPage();
    expect(screen.getByText(/Available/)).toBeDefined();
  });

  // 7. Shows search input placeholder
  it('shows a search input with placeholder text', async () => {
    await renderConnectorsPage();
    const input = screen.getByPlaceholderText('Search connectors...');
    expect(input).toBeDefined();
  });

  // 8. Search input filters connectors by name
  it('filters connectors by search query (name match)', async () => {
    await renderConnectorsPage();

    const input = screen.getByPlaceholderText('Search connectors...');
    fireEvent.change(input, { target: { value: 'Github' } });

    // "GitHub" connector should still be visible
    expect(screen.getByText('GitHub')).toBeDefined();

    // "Gmail" should NOT appear because "Github" doesn't match "gmail"
    expect(screen.queryByText('Gmail & Calendar')).toBeNull();
  });

  // 9. Search with no match shows empty state
  it('shows empty state when no connectors match the search query', async () => {
    await renderConnectorsPage();

    const input = screen.getByPlaceholderText('Search connectors...');
    fireEvent.change(input, { target: { value: 'xyznonexistentconnector' } });

    expect(screen.getByText('No connectors found')).toBeDefined();
    expect(screen.getByText('Try a different search term or category.')).toBeDefined();
  });

  // 10. Category filter tabs are rendered
  it('renders all category filter tabs', async () => {
    await renderConnectorsPage();

    // These labels come from the CATEGORIES array in ConnectorsPage
    const expectedLabels = [
      'All',
      'Productivity',
      'Developer',
      'CRM',
      'Marketing',
      'Finance',
      'Social',
      'AI',
    ];

    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  // 11. Clicking a category tab filters to that category
  it('filters connectors when a category tab is clicked', async () => {
    await renderConnectorsPage();

    // Click the "Developer" category
    fireEvent.click(screen.getByText('Developer'));

    // GitHub is in the Developer category — should be visible
    expect(screen.getByText('GitHub')).toBeDefined();

    // Gmail is in Productivity — should NOT be visible
    expect(screen.queryByText('Gmail & Calendar')).toBeNull();
  });

  // 12. Clicking "All" category tab shows all connectors
  it('clicking All tab shows all connectors', async () => {
    await renderConnectorsPage();

    // First switch to Developer
    fireEvent.click(screen.getByText('Developer'));
    expect(screen.queryByText('Gmail & Calendar')).toBeNull();

    // Then switch back to All
    fireEvent.click(screen.getByText('All'));
    expect(screen.getByText('Gmail & Calendar')).toBeDefined();
    expect(screen.getByText('GitHub')).toBeDefined();
  });

  // 13. Clicking Connect adds a connector to the connected section
  it('connects a connector when Connect button is clicked', async () => {
    await renderConnectorsPage();

    const connectButtons = screen.getAllByText('Connect');
    await act(async () => {
      fireEvent.click(connectButtons[0]!);
    });

    // After connecting, the count badge should increase from 0 to 1
    expect(screen.getByText('1 connected')).toBeDefined();
  });

  // 14. Roadmap callout is visible in "All" category view
  it('shows the 105+ Connectors Planned callout in All view', async () => {
    await renderConnectorsPage();
    expect(screen.getByText('105+ Connectors Planned')).toBeDefined();
  });

  // 15. Roadmap callout is hidden when Exclusive category is active
  it('hides the roadmap callout when Exclusive category is selected', async () => {
    await renderConnectorsPage();

    // Find and click the Exclusive tab — it has the star emoji prefix
    const exclusiveTab = screen.getByText('⭐ AGI Exclusive');
    fireEvent.click(exclusiveTab);

    expect(screen.queryByText('105+ Connectors Planned')).toBeNull();
  });
});
