import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsageWarningBanner } from './UsageWarningBanner';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('UsageWarningBanner', () => {
  it('shows an exhausted percentage without internal dollar balances', () => {
    render(<UsageWarningBanner usageData={[{ provider: 'Pro', usagePercentage: 100 }]} />);

    expect(screen.getByText(/100% of plan usage used/i)).toBeTruthy();
    expect(screen.queryByText(/\$5\.00/)).toBeNull();
  });
});
