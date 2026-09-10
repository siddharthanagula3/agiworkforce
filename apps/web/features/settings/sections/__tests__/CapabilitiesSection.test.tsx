import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const fetchPreferenceNamespace = vi.fn(async (_namespace: string, fallback: unknown) => fallback);
const savePreferenceNamespace = vi.fn(async (_namespace: string, _value: unknown) => undefined);

vi.mock('@/app/settings/_lib/preferences-client', () => ({
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
});
