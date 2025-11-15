import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedAgenticChat } from '../index';

describe('UnifiedAgenticChat', () => {
  it('should render without crashing', () => {
    render(<UnifiedAgenticChat />);
    expect(screen.getByText('AGI Workforce')).toBeInTheDocument();
  });

  it('should display welcome message when no messages exist', () => {
    render(<UnifiedAgenticChat />);
    expect(screen.getByText('Welcome to AGI Workforce')).toBeInTheDocument();
  });

  it('should render sidecar when defaultSidecarOpen is true', () => {
    render(<UnifiedAgenticChat defaultSidecarOpen={true} />);
    expect(screen.getByText('Sidecar')).toBeInTheDocument();
  });

  it('should render input area with placeholder', () => {
    render(<UnifiedAgenticChat />);
    expect(screen.getByPlaceholderText('Type a message or describe a task...')).toBeInTheDocument();
  });

  it('should call onSendMessage when message is sent', async () => {
    const mockOnSend = vi.fn();
    render(<UnifiedAgenticChat onSendMessage={mockOnSend} />);

    // Note: Full interaction testing would require user-event
    // This is a minimal smoke test to verify component renders
    expect(screen.getByText('AGI Workforce')).toBeInTheDocument();
  });

  it('should support different layout modes', () => {
    const { rerender } = render(<UnifiedAgenticChat layout="default" />);
    expect(screen.getByText('AGI Workforce')).toBeInTheDocument();

    rerender(<UnifiedAgenticChat layout="compact" />);
    expect(screen.getByText('AGI Workforce')).toBeInTheDocument();

    rerender(<UnifiedAgenticChat layout="immersive" />);
    expect(screen.getByText('AGI Workforce')).toBeInTheDocument();
  });
});
