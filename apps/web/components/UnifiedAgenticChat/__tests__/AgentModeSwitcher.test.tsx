/**
 * AgentModeSwitcher — component tests
 *
 * Covers:
 *  - Rendering all three mode buttons
 *  - Active-mode visual indicator (aria-pressed + expanded label)
 *  - Mode switching (controlled & uncontrolled)
 *  - Autopilot warning toast
 *  - Disabled state
 *  - useIsSafeMode hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
// ── Mocks ──────────────────────────────────────────────────────────────────────

// sonner toast — capture calls without real DOM rendering
vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// zustand persist — prevent localStorage in jsdom
vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

import { toast } from 'sonner';
import { AgentModeSwitcher, useIsSafeMode, type AgentMode } from '../AgentModeSwitcher';
import { useChatPreferencesStore } from '@features/chat/stores/chat-preferences-store';
import { renderHook } from '@testing-library/react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStore() {
  useChatPreferencesStore.setState({ agentMode: 'standard' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentModeSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders all three mode buttons', () => {
      render(<AgentModeSwitcher />);

      // All three buttons must be present (active label shown visually; inactive via sr-only)
      expect(screen.getByRole('button', { name: /safe/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /standard/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /autopilot/i })).toBeInTheDocument();
    });

    it('has a role=group with accessible label', () => {
      render(<AgentModeSwitcher />);
      expect(screen.getByRole('group', { name: /agent mode/i })).toBeInTheDocument();
    });

    it('marks the active mode button with aria-pressed=true', () => {
      render(<AgentModeSwitcher currentMode="safe" />);
      const safeBtn = screen.getByRole('button', { name: /safe/i });
      expect(safeBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('marks inactive mode buttons with aria-pressed=false', () => {
      render(<AgentModeSwitcher currentMode="safe" />);
      const standardBtn = screen.getByRole('button', { name: /standard/i });
      const autopilotBtn = screen.getByRole('button', { name: /autopilot/i });
      expect(standardBtn).toHaveAttribute('aria-pressed', 'false');
      expect(autopilotBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('applies a custom className to the wrapper', () => {
      const { container } = render(<AgentModeSwitcher className="my-custom-class" />);
      expect(container.firstChild).toHaveClass('my-custom-class');
    });
  });

  // ── Uncontrolled (store) mode ──────────────────────────────────────────────

  describe('uncontrolled mode (store)', () => {
    it('reads the initial mode from the store (standard)', () => {
      render(<AgentModeSwitcher />);
      const standardBtn = screen.getByRole('button', { name: /standard/i });
      expect(standardBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('updates the store when a new mode is clicked', () => {
      render(<AgentModeSwitcher />);
      const safeBtn = screen.getByRole('button', { name: /safe/i });

      act(() => {
        fireEvent.click(safeBtn);
      });

      expect(useChatPreferencesStore.getState().agentMode).toBe('safe');
    });

    it('updates the active mode visually after clicking', () => {
      render(<AgentModeSwitcher />);
      const safeBtn = screen.getByRole('button', { name: /safe/i });

      act(() => {
        fireEvent.click(safeBtn);
      });

      expect(safeBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // ── Controlled mode ───────────────────────────────────────────────────────

  describe('controlled mode', () => {
    it('uses the provided currentMode instead of the store', () => {
      render(<AgentModeSwitcher currentMode="autopilot" />);
      const autopilotBtn = screen.getByRole('button', { name: /autopilot/i });
      expect(autopilotBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onModeChange with the selected mode', () => {
      const onModeChange = vi.fn();
      render(<AgentModeSwitcher currentMode="standard" onModeChange={onModeChange} />);

      const safeBtn = screen.getByRole('button', { name: /safe/i });
      act(() => {
        fireEvent.click(safeBtn);
      });

      expect(onModeChange).toHaveBeenCalledOnce();
      expect(onModeChange).toHaveBeenCalledWith('safe');
    });

    it('does NOT mutate the store when in controlled mode', () => {
      const onModeChange = vi.fn();
      render(<AgentModeSwitcher currentMode="standard" onModeChange={onModeChange} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /autopilot/i }));
      });

      // Store should remain 'standard'
      expect(useChatPreferencesStore.getState().agentMode).toBe('standard');
    });
  });

  // ── Toast notifications ───────────────────────────────────────────────────

  describe('toast notifications', () => {
    it('shows a warning toast when autopilot is selected', () => {
      const onModeChange = vi.fn();
      render(<AgentModeSwitcher currentMode="standard" onModeChange={onModeChange} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /autopilot/i }));
      });

      expect(toast.warning).toHaveBeenCalledOnce();
      expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('Autopilot'));
    });

    it('does NOT show a toast when switching to safe mode', () => {
      const onModeChange = vi.fn();
      render(<AgentModeSwitcher currentMode="standard" onModeChange={onModeChange} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /safe/i }));
      });

      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('does NOT show a toast when switching to standard mode', () => {
      const onModeChange = vi.fn();
      render(<AgentModeSwitcher currentMode="safe" onModeChange={onModeChange} />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /standard/i }));
      });

      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  // ── Disabled state ────────────────────────────────────────────────────────

  describe('disabled state', () => {
    it('marks all buttons as disabled', () => {
      render(<AgentModeSwitcher disabled />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });

    it('does not call onModeChange when disabled', () => {
      const onModeChange = vi.fn();
      render(<AgentModeSwitcher currentMode="standard" onModeChange={onModeChange} disabled />);

      // Clicking a disabled button should not fire the handler
      const safeBtn = screen.getByRole('button', { name: /safe/i });
      act(() => {
        fireEvent.click(safeBtn);
      });

      expect(onModeChange).not.toHaveBeenCalled();
    });

    it('does not show a toast when disabled', () => {
      render(<AgentModeSwitcher currentMode="standard" disabled />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /autopilot/i }));
      });

      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  // ── Mode labels & types ───────────────────────────────────────────────────

  describe('mode label coverage', () => {
    const modes: AgentMode[] = ['safe', 'standard', 'autopilot'];

    modes.forEach((mode) => {
      it(`renders with active mode = "${mode}"`, () => {
        render(<AgentModeSwitcher currentMode={mode} />);
        const btn = screen.getByRole('button', { name: new RegExp(mode, 'i') });
        expect(btn).toHaveAttribute('aria-pressed', 'true');
      });
    });
  });
});

// ── useIsSafeMode ─────────────────────────────────────────────────────────────

describe('useIsSafeMode', () => {
  beforeEach(() => resetStore());

  it('returns false when mode is standard', () => {
    useChatPreferencesStore.setState({ agentMode: 'standard' });
    const { result } = renderHook(() => useIsSafeMode());
    expect(result.current).toBe(false);
  });

  it('returns true when mode is safe', () => {
    useChatPreferencesStore.setState({ agentMode: 'safe' });
    const { result } = renderHook(() => useIsSafeMode());
    expect(result.current).toBe(true);
  });

  it('returns false when mode is autopilot', () => {
    useChatPreferencesStore.setState({ agentMode: 'autopilot' });
    const { result } = renderHook(() => useIsSafeMode());
    expect(result.current).toBe(false);
  });
});
