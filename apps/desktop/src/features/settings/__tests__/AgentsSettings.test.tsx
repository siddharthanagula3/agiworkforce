import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentsSettings } from '../AgentsSettings';

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

const mockSetAutoApproveTools = vi.fn().mockResolvedValue(undefined);
const mockSetMaxTimeoutMinutes = vi.fn();

let mockChatPreferences = {
  autoApproveTools: false,
  compactMode: true,
};

let mockExecutionPreferences = {
  maxTimeoutMinutes: 60,
};

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      chatPreferences: mockChatPreferences,
      executionPreferences: mockExecutionPreferences,
      setAutoApproveTools: mockSetAutoApproveTools,
      setMaxTimeoutMinutes: mockSetMaxTimeoutMinutes,
    }),
  ),
}));

vi.mock('../CustomAgentsList', () => ({
  CustomAgentsList: () => <div>Custom Agents</div>,
}));

describe('AgentsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatPreferences = {
      autoApproveTools: false,
      compactMode: true,
    };
    mockExecutionPreferences = {
      maxTimeoutMinutes: 60,
    };
  });

  describe('Renders with default settings', () => {
    it('renders without crashing', () => {
      expect(() => render(<AgentsSettings />)).not.toThrow();
    });

    it('shows Execution section heading', () => {
      render(<AgentsSettings />);
      expect(screen.getByText(/execution/i)).toBeInTheDocument();
    });

    it('renders the Custom Agents section component', () => {
      render(<AgentsSettings />);
      expect(screen.getByText(/^custom agents$/i)).toBeInTheDocument();
    });

    it('does not expose unproven sub-agent or team toggles in demo settings', () => {
      render(<AgentsSettings />);
      expect(screen.queryByText(/sub-agents & teams/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: /enable sub-agents/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: /enable agent teams/i })).not.toBeInTheDocument();
    });
  });

  describe('Execution preferences', () => {
    it('shows timeout value label (60m by default)', () => {
      render(<AgentsSettings />);
      expect(screen.getByText('60m')).toBeInTheDocument();
    });

    it('does not expose dormant checkpoint or restart controls', () => {
      render(<AgentsSettings />);
      expect(
        screen.queryByRole('switch', { name: /enable checkpointing/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/checkpoint interval/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('switch', { name: /auto-resume on restart/i }),
      ).not.toBeInTheDocument();
    });

    it('does not offer timeout warnings, which no run ever raised', () => {
      render(<AgentsSettings />);
      expect(screen.queryByRole('switch', { name: /timeout warnings/i })).not.toBeInTheDocument();
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
