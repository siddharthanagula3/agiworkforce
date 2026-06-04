import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/auth';
import { SettingsPanel } from '../SettingsPanel';

vi.mock('@agiworkforce/api', () => ({
  chat: {
    clearLocalDatabase: vi.fn().mockResolvedValue(undefined),
  },
  cache: {
    cacheClearAll: vi.fn().mockResolvedValue(undefined),
  },
  settings: {
    settingsV2ClearCache: vi.fn().mockResolvedValue(undefined),
  },
  onboarding: {
    exportUserData: vi.fn().mockResolvedValue('{}'),
    getUserPreference: vi.fn().mockResolvedValue(null),
    setUserPreference: vi.fn().mockResolvedValue(undefined),
  },
  notifications: {
    notificationGetSettings: vi.fn().mockResolvedValue(null),
    notificationSetSettings: vi.fn().mockResolvedValue(undefined),
  },
  models: {
    llmGetOllamaModels: vi.fn().mockResolvedValue(['ministral-3:14b', 'tinyllama:latest']),
  },
}));

vi.mock('../AccountSettings', () => ({
  AccountSettings: () => <div>Cloud account settings</div>,
}));

vi.mock('../UsageDashboard', () => ({
  UsageDashboard: () => <div>Usage dashboard</div>,
}));

vi.mock('../TeamAccountSettings', () => ({
  TeamAccountSettings: () => <div>Team account settings</div>,
}));

vi.mock('../FavoriteModelsSelector', () => ({
  FavoriteModelsSelector: () => <div>Favorite models</div>,
}));

vi.mock('../CustomModelsSettings', () => ({
  CustomModelsSettings: () => <div>Custom models</div>,
}));

vi.mock('../TaskRoutingSettings', () => ({
  TaskRoutingSettings: () => <div>Task routing</div>,
}));

vi.mock('../MasterPasswordSettings', () => ({
  MasterPasswordSettings: () => <div>Master password settings</div>,
}));

vi.mock('../CacheManagement', () => ({
  CacheManagement: () => <div>Cache management</div>,
}));

vi.mock('../AllowedDirectoriesSettings', () => ({
  AllowedDirectoriesSettings: () => <div>Allowed directories</div>,
}));

vi.mock('../AnalyticsSettings', () => ({
  AnalyticsSettings: () => <div>Analytics settings</div>,
}));

vi.mock('@/features/governance/SafetyPolicies', () => ({
  SafetyPolicies: () => <div>Safety policies</div>,
}));

describe('SettingsPanel render stability', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'llm_check_provider_status') {
        return {
          provider: 'ollama',
          available: true,
          configured: true,
          ollamaRunning: true,
        };
      }
      return undefined;
    });

    useAuthStore.setState({
      user: { id: 'local-user', email: '', name: 'Local User' },
      isAuthenticated: true,
      plan: 'local-only',
      planDisplayName: 'Local Mode',
      accessToken: null,
      refreshToken: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the local Account tab without fake account controls', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="account" />);

    expect(await screen.findByText('Cloud account')).toBeInTheDocument();
    expect(screen.getByText('You are in Local Mode')).toBeInTheDocument();
    expect(screen.queryByText('Cloud account settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('renders Models & Keys without tripping the settings error boundary', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="models-keys" />);

    expect(await screen.findByText('API Keys (BYOK)')).toBeInTheDocument();
    expect(screen.getByText('Request routing')).toBeInTheDocument();
    expect(screen.getByText('Local models')).toBeInTheDocument();
    expect(screen.getByText('BYOK providers')).toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('ministral-3:14b')).toBeInTheDocument();
    });
  });

  it('labels the profile and response-style tab as Personalization', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="general" />);

    expect(await screen.findByRole('button', { name: /Personalization/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Appearance$/i })).not.toBeInTheDocument();
  });

  it('keeps cloud account deletion out of Local Mode privacy settings', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="privacy" />);

    expect(await screen.findByText('Clear Local Storage')).toBeInTheDocument();
    expect(screen.getByText('Master password settings')).toBeInTheDocument();
    expect(screen.queryByText('Delete my account')).not.toBeInTheDocument();
    expect(screen.queryByText('Web analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Cloud account settings')).not.toBeInTheDocument();
  });

  it('renders MCP & Skills without tripping the settings error boundary', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="mcp-skills" />);

    expect(await screen.findByText('Customize your workforce')).toBeInTheDocument();
    expect(await screen.findByText('Skill Marketplace')).toBeInTheDocument();
    expect(await screen.findAllByText('MCP Tools')).toHaveLength(2);
    expect(await screen.findAllByText(/Skills & Plugins/i)).toHaveLength(2);
    expect(await screen.findAllByText('MCP Server')).not.toHaveLength(0);
    expect(await screen.findAllByText('Tools')).not.toHaveLength(0);
    expect(await screen.findByText('Research')).toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });
});
