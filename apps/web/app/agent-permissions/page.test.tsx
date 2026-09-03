import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import AgentPermissionsPage from './page';

describe('AgentPermissionsPage', () => {
  it('states when the page was last updated', () => {
    render(<AgentPermissionsPage />);

    expect(
      screen.getByText(new RegExp(`Last updated:\\s*${POLICY_LAST_UPDATED.agentPermissions}`)),
    ).toBeInTheDocument();
  });
});
