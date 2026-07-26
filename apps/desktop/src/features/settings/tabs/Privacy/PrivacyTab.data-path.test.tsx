import { cleanup, render, screen } from '@testing-library/react';
import { appDataDir } from '@tauri-apps/api/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../../stores/auth';
import { PrivacyTab } from './index';

vi.mock('@/lib/tauri-mock', () => ({
  isTauri: true,
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  chat: {
    clearLocalDatabase: vi.fn(),
  },
  cache: {
    cacheClearAll: vi.fn(),
  },
  settings: {
    settingsV2ClearCache: vi.fn(),
  },
  onboarding: {
    exportUserData: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue(null),
    setUserPreference: vi.fn(),
  },
}));

vi.mock('../../MasterPasswordSettings', () => ({
  MasterPasswordSettings: () => <div>Master password settings</div>,
}));

vi.mock('../../Privacy/CloudDataSection', () => ({
  CloudDataSection: () => <div>Cloud data settings</div>,
}));

vi.mock('../../CacheManagement', () => ({
  CacheManagement: () => <div>Cache management</div>,
}));

vi.mock('../../AllowedDirectoriesSettings', () => ({
  AllowedDirectoriesSettings: () => <div>Allowed directories</div>,
}));

vi.mock('../../AnalyticsSettings', () => ({
  AnalyticsSettings: () => <div>Analytics settings</div>,
}));

vi.mock('@/features/governance/SafetyPolicies', () => ({
  SafetyPolicies: () => <div>Safety policies</div>,
}));

describe('PrivacyTab local data path', () => {
  beforeEach(() => {
    vi.mocked(appDataDir).mockResolvedValue(
      '/Users/test/Library/Application Support/com.agiworkforce.desktop',
    );
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the app data directory resolved by Tauri instead of a guessed OS path', async () => {
    render(<PrivacyTab onOpenGovernanceWorkspace={vi.fn()} scope="local" />);

    expect(
      await screen.findByText('/Users/test/Library/Application Support/com.agiworkforce.desktop'),
    ).toBeInTheDocument();
    expect(appDataDir).toHaveBeenCalledOnce();
    expect(screen.queryByText('~/.local/share/agi-workforce/')).not.toBeInTheDocument();
  });
});
