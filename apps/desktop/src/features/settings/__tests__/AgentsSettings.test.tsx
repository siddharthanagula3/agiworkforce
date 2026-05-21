/**
 * H44 — AgentsSettings tests
 *
 * Covers: render with default settings, approval mode radio buttons,
 * sub-agents toggle, agent teams toggle, and execution preference updates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentsSettings } from '../AgentsSettings';

// ── Radix UI / jsdom compat polyfills ────────────────────────────────────────
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

// ── Store mock ────────────────────────────────────────────────────────────────

const mockSetAutoApproveTools = vi.fn().mockResolvedValue(undefined);
const mockSetAlwaysUseAgentMode = vi.fn();
const mockSetFeature = vi.fn();
const mockSetMaxTimeoutMinutes = vi.fn();
const mockSetEnableCheckpointing = vi.fn();
const mockSetCheckpointInterval = vi.fn();
const mockSetAutoResumeOnRestart = vi.fn();
const mockSetEnableTimeoutWarnings = vi.fn();

let mockChatPreferences = {
  alwaysUseAgentMode: false,
  autoApproveTools: false,
  promptCompletionEnabled: true,
  compactMode: true,
};

let mockExecutionPreferences = {
  maxTimeoutMinutes: 60,
  enableCheckpointing: false,
  checkpointInterval: 10,
  autoResumeOnRestart: false,
  enableTimeoutWarnings: true,
};

let mockFeatures: Record<string, boolean> = {
  subAgents: true,
  agentTeams: true,
};

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      chatPreferences: mockChatPreferences,
      executionPreferences: mockExecutionPreferences,
      features: mockFeatures,
      setAutoApproveTools: mockSetAutoApproveTools,
      setAlwaysUseAgentMode: mockSetAlwaysUseAgentMode,
      setFeature: mockSetFeature,
      setMaxTimeoutMinutes: mockSetMaxTimeoutMinutes,
      setEnableCheckpointing: mockSetEnableCheckpointing,
      setCheckpointInterval: mockSetCheckpointInterval,
      setAutoResumeOnRestart: mockSetAutoResumeOnRestart,
      setEnableTimeoutWarnings: mockSetEnableTimeoutWarnings,
    }),
  ),
}));

vi.mock('../CustomAgentsList', () => ({
  CustomAgentsList: () => <div>Custom Agents</div>,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatPreferences = {
      alwaysUseAgentMode: false,
      autoApproveTools: false,
      promptCompletionEnabled: true,
      compactMode: true,
    };
    mockExecutionPreferences = {
      maxTimeoutMinutes: 60,
      enableCheckpointing: false,
      checkpointInterval: 10,
      autoResumeOnRestart: false,
      enableTimeoutWarnings: true,
    };
    mockFeatures = { subAgents: true, agentTeams: true };
  });

  describe('Renders with default settings', () => {
    it('renders without crashing', () => {
      expect(() => render(<AgentsSettings />)).not.toThrow();
    });

    it('shows Agent Configuration section heading', () => {
      render(<AgentsSettings />);
      expect(screen.getByText(/agent configuration/i)).toBeInTheDocument();
    });

    it('shows Sub-agents & Teams section heading', () => {
      render(<AgentsSettings />);
      // Multiple elements contain "sub-agents" (heading + label); confirm at least one heading
      const headings = screen.getAllByText(/sub-agents/i);
      expect(headings.length).toBeGreaterThan(0);
    });

    it('shows Execution section heading', () => {
      render(<AgentsSettings />);
      expect(screen.getByText(/execution/i)).toBeInTheDocument();
    });

    it('renders the Custom Agents section component', () => {
      render(<AgentsSettings />);
      expect(screen.getByText(/^custom agents$/i)).toBeInTheDocument();
    });

    it('shows three approval mode radio options', () => {
      render(<AgentsSettings />);
      expect(screen.getByText(/ask before actions/i)).toBeInTheDocument();
      expect(screen.getByText(/auto-approve safe actions/i)).toBeInTheDocument();
      // "Auto-approve all" label text
      expect(screen.getAllByText(/auto-approve all/i).length).toBeGreaterThan(0);
    });
  });

  describe('Always Use Agent Mode toggle', () => {
    it('renders with checked=false by default', () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /always use agent mode/i });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('calls setAlwaysUseAgentMode when toggled', async () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /always use agent mode/i });
      await userEvent.click(toggle);
      expect(mockSetAlwaysUseAgentMode).toHaveBeenCalledWith(true);
    });
  });

  describe('Approval mode radio buttons', () => {
    it('"Ask before actions" radio is checked when both flags are false', () => {
      render(<AgentsSettings />);
      // The "Ask before actions" radio is the first in the approval-mode group.
      // We locate it by the label text of its parent label element.
      const radios = screen.getAllByRole('radio');
      const askRadio = radios.find((r) =>
        r.closest('label')?.textContent?.toLowerCase().includes('ask before actions'),
      );
      expect(askRadio).toBeDefined();
      if (askRadio) {
        expect((askRadio as HTMLInputElement).checked).toBe(true);
      }
    });

    it('clicking "Auto-approve all" calls setAutoApproveTools(true)', async () => {
      render(<AgentsSettings />);
      // Find the "Auto-approve all" radio by finding all radios and clicking the third
      const radios = screen.getAllByRole('radio');
      // The third approval-mode radio is "Auto-approve all"
      const autoApproveAllRadio = radios.find(
        (r) =>
          r.closest('label')?.textContent?.toLowerCase().includes('auto-approve all') &&
          !r.closest('label')?.textContent?.toLowerCase().includes('safe'),
      );
      expect(autoApproveAllRadio).toBeDefined();
      await userEvent.click(autoApproveAllRadio!);
      expect(mockSetAutoApproveTools).toHaveBeenCalledWith(true);
    });

    it('clicking "Auto-approve safe actions" calls setAlwaysUseAgentMode(true)', async () => {
      render(<AgentsSettings />);
      const radios = screen.getAllByRole('radio');
      const safeRadio = radios.find((r) =>
        r.closest('label')?.textContent?.toLowerCase().includes('safe actions'),
      );
      expect(safeRadio).toBeDefined();
      await userEvent.click(safeRadio!);
      expect(mockSetAlwaysUseAgentMode).toHaveBeenCalledWith(true);
    });
  });

  describe('Sub-agents toggle', () => {
    it('renders Enable Sub-agents switch as checked when feature is enabled', () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /enable sub-agents/i });
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('calls setFeature("subAgents", false) when toggled off', async () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /enable sub-agents/i });
      await userEvent.click(toggle);
      expect(mockSetFeature).toHaveBeenCalledWith('subAgents', false);
    });
  });

  describe('Agent Teams toggle', () => {
    it('renders Enable Agent Teams switch as checked when feature is enabled', () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /enable agent teams/i });
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('calls setFeature("agentTeams", false) when toggled off', async () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /enable agent teams/i });
      await userEvent.click(toggle);
      expect(mockSetFeature).toHaveBeenCalledWith('agentTeams', false);
    });
  });

  describe('Execution preferences', () => {
    it('shows timeout value label (60m by default)', () => {
      render(<AgentsSettings />);
      expect(screen.getByText('60m')).toBeInTheDocument();
    });

    it('shows Checkpointing switch as unchecked by default', () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /enable checkpointing/i });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('calls setEnableCheckpointing(true) when checkpointing is toggled on', async () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /enable checkpointing/i });
      await userEvent.click(toggle);
      expect(mockSetEnableCheckpointing).toHaveBeenCalledWith(true);
    });

    it('does not show checkpoint interval slider when checkpointing is disabled', () => {
      render(<AgentsSettings />);
      // "Checkpoint Interval" label only appears when checkpointing is enabled
      expect(screen.queryByText(/checkpoint interval/i)).not.toBeInTheDocument();
    });

    it('shows checkpoint interval slider when checkpointing is enabled', () => {
      mockExecutionPreferences = { ...mockExecutionPreferences, enableCheckpointing: true };
      render(<AgentsSettings />);
      expect(screen.getByText(/checkpoint interval/i)).toBeInTheDocument();
    });

    it('shows Timeout Warnings switch', () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /timeout warnings/i });
      expect(toggle).toBeInTheDocument();
    });

    it('shows auto-resume switch disabled when checkpointing is off', () => {
      render(<AgentsSettings />);
      const autoResumeSwitch = screen.getByRole('switch', { name: /auto-resume on restart/i });
      expect(autoResumeSwitch).toBeDisabled();
    });
  });

  describe('Quick Toggle (Auto-Approve all tools)', () => {
    it('renders the Quick Toggle section', () => {
      render(<AgentsSettings />);
      expect(screen.getByText(/quick toggle/i)).toBeInTheDocument();
    });

    it('shows Auto-Approve All Tools switch unchecked by default', () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /auto-approve all tools/i });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('calls setAutoApproveTools when Quick Toggle switch is clicked', async () => {
      render(<AgentsSettings />);
      const toggle = screen.getByRole('switch', { name: /auto-approve all tools/i });
      await userEvent.click(toggle);
      await waitFor(() => {
        expect(mockSetAutoApproveTools).toHaveBeenCalledWith(true);
      });
    });

    it('shows ACTIVE badge when autoApproveTools is enabled', () => {
      mockChatPreferences = { ...mockChatPreferences, autoApproveTools: true };
      render(<AgentsSettings />);
      expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
    });
  });
});
