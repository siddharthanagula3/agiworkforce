/**
 * Tests for SkillsPluginsSettings component
 *
 * Covers: non-Tauri fallback, loading state, error handling,
 * successful plugin/command/skill/agent display, and empty-state rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillsPluginsSettings } from '../SkillsPluginsSettings';

// Radix UI / jsdom compat polyfills
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
const mockIsTauriContext = vi.fn(() => true);

vi.mock('@/lib/tauri-mock', () => ({
  isTauriContext: () => mockIsTauriContext(),
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: { allowedDirectories: string[] }) => unknown) =>
    selector({ allowedDirectories: ['/projects/myapp'] }),
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLUGINS_JSON = JSON.stringify({
  version: 2,
  plugins: {
    'code-review@claude-plugins-official': [
      {
        scope: 'local',
        installPath: '/home/.claude/plugins/cache/code-review/abc123',
        version: 'abc123',
        installedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    'hookify@claude-plugins-official': [
      {
        scope: 'user',
        installPath: '/home/.claude/plugins/cache/hookify/xyz456',
        version: 'xyz456',
        installedAt: '2026-01-02T00:00:00.000Z',
      },
    ],
  },
});

const CODE_REVIEW_MANIFEST = JSON.stringify({
  name: 'Code Review',
  description: 'Automated code review',
  version: '1.0.0',
  skills: [{ name: 'code-reviewer' }, { name: 'silent-failure-hunter' }],
  agents: [{ name: 'code-reviewer-agent' }],
});

const DIR_ENTRIES_COMMANDS = [
  {
    name: 'coderabbit-full.md',
    path: '/projects/myapp/.claude/commands/coderabbit-full.md',
    is_file: true,
    is_dir: false,
  },
  {
    name: 'self-review.md',
    path: '/projects/myapp/.claude/commands/self-review.md',
    is_file: true,
    is_dir: false,
  },
];

const DIR_ENTRIES_SKILLS = [
  {
    name: 'build-and-check',
    path: '/projects/myapp/.claude/skills/build-and-check',
    is_file: false,
    is_dir: true,
  },
  {
    name: 'fix-rust',
    path: '/projects/myapp/.claude/skills/fix-rust',
    is_file: false,
    is_dir: true,
  },
];

const DIR_ENTRIES_AGENTS = [
  {
    name: 'frontend-engineer.md',
    path: '/projects/myapp/.claude/agents/frontend-engineer.md',
    is_file: true,
    is_dir: false,
  },
];

function setupSuccessfulLoad({
  commands = DIR_ENTRIES_COMMANDS,
  skills = DIR_ENTRIES_SKILLS,
  agents = DIR_ENTRIES_AGENTS,
  hookifyManifestFails = true,
  pluginsJson = PLUGINS_JSON,
}: {
  commands?: typeof DIR_ENTRIES_COMMANDS;
  skills?: typeof DIR_ENTRIES_SKILLS;
  agents?: typeof DIR_ENTRIES_AGENTS;
  hookifyManifestFails?: boolean;
  pluginsJson?: string;
} = {}) {
  mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'get_home_directory') return Promise.resolve('/home');
    if (cmd === 'file_read') {
      const path = args?.path as string;
      if (path.endsWith('installed_plugins.json')) return Promise.resolve(pluginsJson);
      if (path.includes('code-review') && path.endsWith('plugin.json'))
        return Promise.resolve(CODE_REVIEW_MANIFEST);
      if (path.includes('hookify') && path.endsWith('plugin.json') && hookifyManifestFails)
        return Promise.reject(new Error('not found'));
      return Promise.resolve('{}');
    }
    if (cmd === 'dir_list') {
      const path = args?.path as string;
      if (path.endsWith('/commands')) return Promise.resolve(commands);
      if (path.endsWith('/skills')) return Promise.resolve(skills);
      if (path.endsWith('/agents')) return Promise.resolve(agents);
      return Promise.resolve([]);
    }
    return Promise.reject(new Error(`Unexpected invoke: ${cmd}`));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SkillsPluginsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriContext.mockReturnValue(true);
  });

  describe('Non-Tauri context', () => {
    it('shows "requires desktop app" message', () => {
      mockIsTauriContext.mockReturnValue(false);
      render(<SkillsPluginsSettings />);

      expect(screen.getByText(/requires the desktop app/i)).toBeInTheDocument();
      expect(screen.queryByText(/loading plugins/i)).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loading spinner while data is being fetched', () => {
      // Never resolves — component stays in loading state
      mockInvoke.mockReturnValue(new Promise(() => {}));
      render(<SkillsPluginsSettings />);

      expect(screen.getByText(/loading plugins/i)).toBeInTheDocument();
    });
  });

  describe('Successful load', () => {
    it('displays plugin with display name from manifest', async () => {
      setupSuccessfulLoad();
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument();
      });
    });

    it('humanizes plugin ID when manifest is unavailable', async () => {
      setupSuccessfulLoad({ hookifyManifestFails: true });
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        // hookify → Hookify
        expect(screen.getByText('Hookify')).toBeInTheDocument();
      });
    });

    it('shows skill and agent names after expanding plugin row', async () => {
      setupSuccessfulLoad();
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument();
      });

      // Expand the Code Review row
      await userEvent.click(screen.getByText('Code Review').closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('code-reviewer')).toBeInTheDocument();
        expect(screen.getByText('silent-failure-hunter')).toBeInTheDocument();
        expect(screen.getByText('code-reviewer-agent')).toBeInTheDocument();
      });
    });

    it('renders slash commands without .md extension', async () => {
      setupSuccessfulLoad();
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText('coderabbit-full')).toBeInTheDocument();
        expect(screen.getByText('self-review')).toBeInTheDocument();
      });
    });

    it('renders project skills', async () => {
      setupSuccessfulLoad();
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText('build-and-check')).toBeInTheDocument();
        expect(screen.getByText('fix-rust')).toBeInTheDocument();
      });
    });

    it('shows agents section collapsed; expands on click to reveal agent names', async () => {
      setupSuccessfulLoad();
      render(<SkillsPluginsSettings />);

      // Agent name not visible until section is expanded
      await waitFor(() => {
        // The section header should exist (with count badge "1")
        expect(screen.getByText('Project Agents')).toBeInTheDocument();
      });
      expect(screen.queryByText('frontend-engineer')).not.toBeInTheDocument();

      await userEvent.click(screen.getByText('Project Agents').closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('frontend-engineer')).toBeInTheDocument();
      });
    });
  });

  describe('Empty states', () => {
    it('shows "no plugins installed" when plugin registry is empty', async () => {
      setupSuccessfulLoad({ pluginsJson: JSON.stringify({ version: 2, plugins: {} }) });
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText(/no plugins installed/i)).toBeInTheDocument();
      });
    });

    it('shows empty-state message for commands when directory is empty', async () => {
      setupSuccessfulLoad({ commands: [] });
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText(/no slash commands found/i)).toBeInTheDocument();
      });
    });

    it('shows empty-state message for skills when directory is empty', async () => {
      setupSuccessfulLoad({ skills: [] });
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText(/no skills found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Graceful degradation', () => {
    it('does not crash when file_read fails for plugins registry', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'get_home_directory') return Promise.resolve('/home');
        if (cmd === 'file_read') return Promise.reject(new Error('permission denied'));
        return Promise.resolve([]);
      });

      render(<SkillsPluginsSettings />);

      // Component should settle without crashing
      await waitFor(() => {
        expect(screen.queryByText(/loading plugins/i)).not.toBeInTheDocument();
      });
      expect(screen.getByText(/Skills & Plugins/i)).toBeInTheDocument();
    });

    it('shows "no plugins installed" when JSON parsing fails', async () => {
      setupSuccessfulLoad({ pluginsJson: 'invalid-json' });
      render(<SkillsPluginsSettings />);

      // JSON.parse error should be caught — no plugins shown, no crash
      await waitFor(() => {
        expect(screen.queryByText(/loading plugins/i)).not.toBeInTheDocument();
      });
      expect(screen.getByText(/no plugins installed/i)).toBeInTheDocument();
    });
  });

  describe('Refresh button', () => {
    it('re-triggers data loading when clicked', async () => {
      setupSuccessfulLoad();
      render(<SkillsPluginsSettings />);

      await waitFor(() => {
        expect(screen.getByText('Code Review')).toBeInTheDocument();
      });

      const callsBefore = mockInvoke.mock.calls.length;

      // The refresh button has no text — find it by its position next to the heading
      const refreshBtn = screen.getByRole('button', { name: '' });
      await userEvent.click(refreshBtn);

      await waitFor(() => {
        expect(mockInvoke.mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });
});
