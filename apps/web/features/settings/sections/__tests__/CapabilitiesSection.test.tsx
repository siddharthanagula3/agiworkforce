import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const fetchPreferenceNamespace = vi.fn(async (_namespace: string, fallback: unknown) => fallback);
const savePreferenceNamespace = vi.fn(async (_namespace: string, _value: unknown) => undefined);

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  readAutonomousToolApprovalsAllowed: vi.fn(() => false),
  fetchPreferenceNamespace: (...args: unknown[]) =>
    fetchPreferenceNamespace(...(args as [string, unknown])),
  savePreferenceNamespace: (...args: unknown[]) =>
    savePreferenceNamespace(...(args as [string, unknown])),
  readPreferencesVersion: async () => null,
  readOrganizationMemoryAllowed: async () => true,
  PreferenceVersionConflictError: class PreferenceVersionConflictError extends Error {},
}));

vi.mock('@/lib/runtime/memory-capability', () => ({
  resetMemoryCapabilityCache: vi.fn(),
}));

vi.mock('../../components/ToolApprovalDefaultsPanel', () => ({
  ToolApprovalDefaultsPanel: () => null,
}));

vi.mock('@/features/settings/components/LockdownModePanel', () => ({
  LockdownModePanel: () => null,
}));

import { CapabilitiesSection } from '../CapabilitiesSection';

describe('CapabilitiesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no longer renders the memory toggles inline', () => {
    render(<CapabilitiesSection />);

    expect(screen.queryByRole('switch', { name: 'Memory' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Generate from past chats' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Search past chats' })).toBeNull();
  });

  it('carries no relocation notes, because the nav lists both sections itself', () => {
    render(<CapabilitiesSection />);

    expect(screen.queryByText(/has moved to/i)).toBeNull();
    expect(screen.queryByText(/have moved to/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Memory' })).toBeNull();
  });

  it('still renders the code execution toggle it kept', () => {
    render(<CapabilitiesSection />);

    expect(
      screen.getByRole('switch', { name: 'Cloud code execution and file creation' }),
    ).toBeVisible();
  });

  it('reports a failed save as a failure rather than another muted status line', async () => {
    savePreferenceNamespace.mockRejectedValueOnce(new Error('storage unavailable'));
    render(<CapabilitiesSection />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Synced|Saved/));

    fireEvent.click(screen.getByRole('switch', { name: 'Cloud code execution and file creation' }));

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent('Save failed: storage unavailable');
    expect(failure).toHaveStyle({ color: 'var(--settings-destructive-text)' });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
