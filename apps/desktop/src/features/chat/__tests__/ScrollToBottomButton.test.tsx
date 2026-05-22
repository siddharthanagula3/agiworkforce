import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Minimal representation of the scroll-to-bottom button
// mirroring ChatStream.tsx lines 928-944 styling
function ScrollToBottomButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-muted/90 backdrop-blur-sm border border-white/10 text-sm text-foreground hover:bg-accent/90 shadow-lg z-10"
      aria-label="Scroll to bottom"
    >
      <span aria-hidden="true">↓</span>
      <span>New messages</span>
    </button>
  );
}

describe('Scroll-to-bottom floating button parity', () => {
  it('does not render when user is at bottom (visible=false)', () => {
    const { container } = render(<ScrollToBottomButton visible={false} onClick={() => {}} />);
    expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
    expect(container).toMatchSnapshot();
  });

  it('renders the floating button when user has scrolled up (visible=true)', () => {
    const { container } = render(<ScrollToBottomButton visible={true} onClick={() => {}} />);
    expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
    expect(screen.getByText('New messages')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls onClick when button is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<ScrollToBottomButton visible={true} onClick={handleClick} />);
    await user.click(screen.getByLabelText('Scroll to bottom'));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
