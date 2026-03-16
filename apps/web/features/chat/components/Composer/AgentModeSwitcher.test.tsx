import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentModeSwitcher } from './AgentModeSwitcher';

// Stub Radix Popover so it renders inline in jsdom
vi.mock('@shared/ui/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-open={open}>{children}</div>
  ),
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

describe('AgentModeSwitcher', () => {
  it('renders the current mode label', () => {
    render(<AgentModeSwitcher mode="solo" onChange={vi.fn()} />);
    // The mode label is hidden on mobile but should still be in the DOM
    // We check for the aria-label instead which is always present
    const button = screen.getByRole('button', { name: /agent mode: solo/i });
    expect(button).toBeInTheDocument();
  });

  it('shows all 5 mode options in the popover content', () => {
    render(<AgentModeSwitcher mode="solo" onChange={vi.fn()} />);
    // PopoverContent is always rendered in our stub.
    // 'Solo' appears twice (trigger + list) so we use getAllByText.
    expect(screen.getAllByText('Solo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Race')).toBeInTheDocument();
  });

  it('calls onChange with the selected mode', async () => {
    const onChangeMock = vi.fn();
    render(<AgentModeSwitcher mode="solo" onChange={onChangeMock} />);

    const engineerButton = screen.getAllByText('Engineer')[0]!;
    fireEvent.click(engineerButton);

    await waitFor(() => {
      expect(onChangeMock).toHaveBeenCalledWith('engineer');
    });
  });

  it('marks the active mode with an indicator dot', () => {
    const { container } = render(<AgentModeSwitcher mode="research" onChange={vi.fn()} />);
    // The selected indicator is a small rounded-full bg-primary dot
    const dots = container.querySelectorAll('.bg-primary.rounded-full');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('disables the trigger button when disabled prop is true', () => {
    render(<AgentModeSwitcher mode="solo" onChange={vi.fn()} disabled />);
    const button = screen.getByRole('button', { name: /agent mode/i });
    expect(button).toBeDisabled();
  });
});
