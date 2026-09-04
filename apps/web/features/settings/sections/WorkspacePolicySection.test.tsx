import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminPolicy } from '@agiworkforce/types';

const { mockOverview, mockUpdate } = vi.hoisted(() => ({
  mockOverview: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../hooks/use-settings-queries', () => ({
  useWorkspacePolicy: () => mockOverview(),
  useUpdateWorkspacePolicy: () => ({ mutate: mockUpdate, isPending: false }),
}));

import { WorkspacePolicySection } from './WorkspacePolicySection';

const ORG = '11111111-1111-4111-8111-111111111111';

function policy(overrides: Partial<AdminPolicy> = {}): AdminPolicy {
  return {
    organizationId: ORG,
    defaultPrivacyMode: 'byok',
    allowedPrivacyModes: ['local', 'byok'],
    allowManagedCompute: false,
    requireLocalToByokPreview: true,
    chatSyncSurfaces: ['web', 'desktop', 'mobile'],
    allowCliCloudSync: false,
    allowVsCodeCloudSync: false,
    allowChromeCloudSync: false,
    auditExportEnabled: true,
    retentionDays: 365,
    retentionEnforced: false,
    externalSharingEnabled: true,
    allowMemory: false,
    secretHandling: 'redact',
    requireMfa: false,
    monthlySpendCapCents: null,
    zeroDataRetentionOnly: false,
    ipAllowList: [],
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function overview(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      organizationId: ORG,
      configured: true,
      canManagePolicy: true,
      currentUserRole: 'admin',
      policy: policy(),
      ...overrides,
    },
  };
}

function renderSection() {
  return render(<WorkspacePolicySection />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspacePolicySection security controls', () => {
  it('shows the current secret handling mode and lets an admin change it', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const select = screen.getByLabelText('Secret handling') as HTMLSelectElement;
    expect(select.value).toBe('redact');

    await user.selectOptions(select, 'block');
    expect(select.value).toBe('block');

    await user.click(screen.getByRole('button', { name: /save policy/i }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ secretHandling: 'block' }));
  });

  it('toggles the multi-factor authentication requirement', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const toggle = screen.getByLabelText('Require multi-factor authentication');
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ requireMfa: true }));
  });

  it('turns workspace memory on and saves it', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview({ policy: policy({ allowMemory: false }) }));
    renderSection();

    const toggle = screen.getByLabelText('Allow memory');
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/memory is off for the workspace/i)).toBeInTheDocument();

    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ allowMemory: true }));
  });

  it('reports no spend cap when the policy has none', () => {
    mockOverview.mockReturnValue(overview());
    renderSection();

    expect(screen.getByText(/no cap/i)).toBeInTheDocument();
    const input = screen.getByLabelText('Monthly spend cap in dollars') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('converts a dollar amount into cents when a spend cap is set', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview({ policy: policy({ monthlySpendCapCents: null }) }));
    renderSection();

    const input = screen.getByLabelText('Monthly spend cap in dollars');
    await user.type(input, '250');
    await user.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ monthlySpendCapCents: 25000 }),
    );
  });

  it('clearing the spend cap field sets no cap', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview({ policy: policy({ monthlySpendCapCents: 5000 }) }));
    renderSection();

    const input = screen.getByLabelText('Monthly spend cap in dollars');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ monthlySpendCapCents: null }),
    );
  });

  it('toggles zero data retention only', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    await user.click(screen.getByLabelText('Require zero data retention providers'));
    await user.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ zeroDataRetentionOnly: true }),
    );
  });

  it('describes an empty IP allow list as no restriction', () => {
    mockOverview.mockReturnValue(overview());
    renderSection();

    expect(screen.getByText(/from any address/i)).toBeInTheDocument();
  });

  it('adds a valid CIDR block to the allow list and saves it', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const input = screen.getByLabelText('Add an IP address or CIDR block');
    await user.type(input, '203.0.113.0/24');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('203.0.113.0/24')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save policy/i }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ipAllowList: ['203.0.113.0/24'] }),
    );
  });

  it('rejects a malformed IP allow list entry with inline feedback', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview());
    renderSection();

    const input = screen.getByLabelText('Add an IP address or CIDR block');
    await user.type(input, 'not-an-ip');

    expect(screen.getByRole('alert')).toHaveTextContent(/CIDR block/i);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('removes an entry from the allow list', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue(overview({ policy: policy({ ipAllowList: ['203.0.113.0/24'] }) }));
    renderSection();

    expect(screen.getByText('203.0.113.0/24')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Remove 203.0.113.0/24 from the allow list'));

    expect(screen.queryByText('203.0.113.0/24')).toBeNull();
  });

  it('disables every security control for a member who cannot manage policy', () => {
    mockOverview.mockReturnValue(overview({ canManagePolicy: false, currentUserRole: 'member' }));
    renderSection();

    expect(screen.getByLabelText('Secret handling')).toBeDisabled();
    expect(screen.getByLabelText('Require multi-factor authentication')).toBeDisabled();
    expect(screen.getByLabelText('Monthly spend cap in dollars')).toBeDisabled();
    expect(screen.getByLabelText('Require zero data retention providers')).toBeDisabled();
    expect(screen.getByLabelText('Add an IP address or CIDR block')).toBeDisabled();
  });
});
