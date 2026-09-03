import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsSectionNavigationProvider } from '../../components/SettingsSectionLink';

const fetchPreferenceNamespace = vi.fn(async (_namespace: string, fallback: unknown) => fallback);
const savePreferenceNamespace = vi.fn(async (_namespace: string, _value: unknown) => undefined);

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) =>
    fetchPreferenceNamespace(...(args as [string, unknown])),
  savePreferenceNamespace: (...args: unknown[]) =>
    savePreferenceNamespace(...(args as [string, unknown])),
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

  it('links to /settings/memory when rendered as a plain route', () => {
    render(<CapabilitiesSection />);

    const link = screen.getByRole('link', { name: 'Memory' });
    expect(link).toHaveAttribute('href', '/settings/memory');
  });

  it('navigates to the memory section when rendered inside the settings modal', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <SettingsSectionNavigationProvider onNavigate={onNavigate}>
        <CapabilitiesSection />
      </SettingsSectionNavigationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Memory' }));

    expect(onNavigate).toHaveBeenCalledWith('memory');
  });

  it('still renders the code execution toggle it kept', () => {
    render(<CapabilitiesSection />);

    expect(
      screen.getByRole('switch', { name: 'Cloud code execution and file creation' }),
    ).toBeVisible();
  });
});
