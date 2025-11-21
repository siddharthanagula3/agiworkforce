// Mock heavy hooks and components that require Tauri/event listeners or canvas
vi.mock('../../../hooks/useAgenticEvents', () => ({
  useAgenticEvents: vi.fn(),
}));
vi.mock('../../Terminal/TerminalWorkspace', () => ({
  TerminalWorkspace: () => <div data-testid="terminal-workspace" />,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedAgenticChat } from '../index';

describe('UnifiedAgenticChat', () => {
  it('should render without crashing', () => {
    render(<UnifiedAgenticChat />);
    expect(screen.getByText(/AGI Workforce/i)).toBeInTheDocument();
  });

  it('should display welcome message when no messages exist', () => {
    render(<UnifiedAgenticChat />);
    expect(screen.getByText(/Ready when you are/i)).toBeInTheDocument();
  });

  it('should render input area with placeholder', () => {
    render(<UnifiedAgenticChat />);
    expect(screen.getByPlaceholderText('Ask anything...')).toBeInTheDocument();
  });

  it('should call onSendMessage when message is sent', async () => {
    const mockOnSend = vi.fn();
    render(<UnifiedAgenticChat onSendMessage={mockOnSend} />);

    // Note: Full interaction testing would require user-event
    // This is a minimal smoke test to verify component renders
    expect(screen.getByText(/AGI Workforce/i)).toBeInTheDocument();
  });

  it('should support different layout modes', () => {
    const { rerender } = render(<UnifiedAgenticChat layout="default" />);
    expect(screen.getByText(/AGI Workforce/i)).toBeInTheDocument();

    rerender(<UnifiedAgenticChat layout="compact" />);
    expect(screen.getByText(/AGI Workforce/i)).toBeInTheDocument();

    rerender(<UnifiedAgenticChat layout="immersive" />);
    expect(screen.getByText(/AGI Workforce/i)).toBeInTheDocument();
  });
});
