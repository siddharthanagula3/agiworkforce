import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/auth';
import { useAppModeStore } from '../../../stores/appModeStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { SettingsPanel } from '../SettingsPanel';

vi.mock('@agiworkforce/desktop-command-client', () => ({
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

vi.mock('../CustomModelsSettings', () => ({
  CustomModelsSettings: () => <div>Custom models</div>,
}));

vi.mock('@/features/skill-marketplace/SkillMarketplace', () => ({
  SkillMarketplace: () => <div>Skill Marketplace</div>,
}));

vi.mock('@/features/connectors/ConnectorGallery', () => ({
  ConnectorGallery: () => <div>Connector gallery</div>,
}));

vi.mock('../SkillsPluginsSettings', () => ({
  SkillsPluginsSettings: () => <div>Plugins settings</div>,
}));

vi.mock('../AgentsSettings', () => ({
  AgentsSettings: () => (
    <div>
      <div>Agent Configuration</div>
      <div>Custom Agents</div>
    </div>
  ),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  MemoryEditor: () => <div>Local memory editor</div>,
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
      if (command === 'ollama_check_status') {
        return true;
      }
      if (command === 'ollama_list_models') {
        return [
          {
            name: 'ministral-3:14b',
            size: 9_000_000_000,
            modified_at: '2026-07-23T00:00:00Z',
            digest: 'test-digest',
            details: {
              parameter_size: '14B',
              quantization_level: 'Q4_K_M',
              family: 'ministral',
              families: ['ministral'],
              parent_model: '',
              format: 'gguf',
            },
          },
        ];
      }
      if (command === 'ollama_pull_model') {
        return undefined;
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
    useAppModeStore.setState({
      mode: 'local',
      hasOnboarded: true,
      hasSelectedMode: true,
    });
    useSettingsStore.setState((state) => ({
      llmConfig: {
        ...state.llmConfig,
        ollamaUrl: 'http://localhost:11434',
      },
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps Cloud account controls out of the Local Settings boundary', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="account" />);

    expect(await screen.findByText('Mode')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Account$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Cloud account settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('renders Models & Keys without tripping the settings error boundary', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="models-keys" />);

    expect(await screen.findByText('API Keys (BYOK)')).toBeInTheDocument();
    expect(screen.getByText('Request routing')).toBeInTheDocument();
    expect(screen.getByText('Local models')).toBeInTheDocument();
    expect(screen.getByText('BYOK providers')).toBeInTheDocument();
    expect(screen.queryByText('Favorite models')).not.toBeInTheDocument();
    expect(screen.queryByText('Task Routing')).not.toBeInTheDocument();
    expect(screen.queryByText('Task routing')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('ministral-3:14b')).toBeInTheDocument();
    });
  });

  it('installs a local model through the configured Ollama runtime', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="models-keys" />);

    const modelInput = await screen.findByRole('textbox', { name: 'Model to install' });
    fireEvent.change(modelInput, { target: { value: 'smollm2:135m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install model' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('ollama_pull_model', {
        modelName: 'smollm2:135m',
        baseUrl: 'http://localhost:11434',
      });
    });
  });

  it('lets users recover from a malformed saved Ollama URL without reopening Settings', async () => {
    useSettingsStore.setState((state) => ({
      llmConfig: {
        ...state.llmConfig,
        ollamaUrl: 'h',
      },
    }));
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === 'ollama_check_status') {
        return (
          (args as Record<string, unknown> | undefined)?.['baseUrl'] === 'http://localhost:11434/'
        );
      }
      if (command === 'ollama_list_models') {
        return [
          {
            name: 'smollm2:135m',
            size: 270_000_000,
            modified_at: '2026-07-23T00:00:00Z',
            digest: 'test-digest',
            details: {},
          },
        ];
      }
      return undefined;
    });

    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="models-keys" />);

    expect(await screen.findByText(/Ollama not detected/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Model to install' })).not.toBeInTheDocument();
    const retryButton = await screen.findByRole('button', { name: 'Re-check Ollama status' });

    fireEvent.change(screen.getByDisplayValue('h'), {
      target: { value: 'http://localhost:11434' },
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().llmConfig.ollamaUrl).toBe('http://localhost:11434/');
      expect(retryButton).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Re-check Ollama status' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('ollama_check_status', {
        baseUrl: 'http://localhost:11434/',
      });
    });
    expect(await screen.findByRole('textbox', { name: 'Model to install' })).toBeInTheDocument();
  });

  it('labels the profile and response-style tab as Personalization', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="general" />);

    expect(await screen.findByRole('button', { name: /Personalization/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Appearance$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Customize')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Directory/i })).not.toBeInTheDocument();
    // Skills now lives UNDER Capabilities (source-of-truth IA), so the top-level
    // nav exposes Capabilities, not a standalone Skills entry.
    expect(screen.getByRole('button', { name: /^Capabilities$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Skills$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Connectors$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Plugins$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Agents$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Memory$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Usage$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Extensions$/i })).toBeInTheDocument();
  });

  it('shows the backend-owned account plan in the mode summary', async () => {
    useAuthStore.setState({ plan: 'max', planDisplayName: 'Max' });
    useAppModeStore.setState({ mode: 'cloud' });

    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="general" />);

    expect(await screen.findByText('Max 5x', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Free', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('keeps cloud account deletion out of Local Mode privacy settings', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="privacy" />);

    expect(await screen.findByText('Clear Local Storage')).toBeInTheDocument();
    expect(screen.getByText('Master password settings')).toBeInTheDocument();
    expect(screen.queryByText('Delete my account')).not.toBeInTheDocument();
    expect(screen.queryByText('Web analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Cloud account settings')).not.toBeInTheDocument();
  });

  it('renders Skills as a direct Settings page', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="skills" />);

    expect(await screen.findByText('Skill Marketplace')).toBeInTheDocument();
    expect(screen.queryByText('Directory')).not.toBeInTheDocument();
    expect(screen.queryByText('MCP & skills')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('renders Connectors as a direct Settings page', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="connectors" />);

    expect(await screen.findByText('Connector gallery')).toBeInTheDocument();
    expect(screen.queryByText('Directory')).not.toBeInTheDocument();
    expect(screen.queryByText('MCP & skills')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('renders Plugins as a direct Settings page', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="plugins" />);

    expect(await screen.findByText('Plugins settings')).toBeInTheDocument();
    expect(screen.queryByText('Directory')).not.toBeInTheDocument();
    expect(screen.queryByText('MCP & skills')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('renders Agents as the real custom-agent management surface', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="agents" />);

    expect(await screen.findByText('Agent Configuration')).toBeInTheDocument();
    expect(screen.getByText('Custom Agents')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Capabilities$/i })).toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('renders Memory as a local persisted memory surface', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="memory" />);

    expect(await screen.findByText('Local memory editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Capabilities$/i })).toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('renders Capabilities as a real section housing Skills + tool/computer-use (DESK-1)', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="capabilities" />);

    // Capabilities is now a canonical settings section (source-of-truth IA), not a
    // legacy alias for Agents. It composes the (previously orphaned) computer-use
    // controls + the Skill Marketplace.
    expect(await screen.findByText('Skill Marketplace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Capabilities$/i })).toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });

  it('maps legacy MCP settings links to Connectors instead of the archived combined surface', async () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="mcp" />);

    expect(await screen.findByText('Connector gallery')).toBeInTheDocument();
    expect(screen.queryByText('Directory')).not.toBeInTheDocument();
    expect(screen.queryByText('MCP & skills')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings Panel Error')).not.toBeInTheDocument();
  });
});
