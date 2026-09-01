import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CircleAlert, RefreshCw } from '@agiworkforce/icons';
import { TranscriptNotice } from './TranscriptNotice';

function renderNotice(props: Partial<React.ComponentProps<typeof TranscriptNotice>> = {}) {
  const { container } = render(
    <TranscriptNotice icon={CircleAlert} message="Something went wrong." {...props} />,
  );
  return container.firstElementChild as HTMLElement;
}

describe('TranscriptNotice tone tokens', () => {
  it('paints a danger notice with the destructive frame and the danger TEXT-role token', () => {
    const root = renderNotice({ tone: 'danger' });
    expect(root).toHaveClass('border-destructive/30', 'bg-destructive/5', 'text-muted-foreground');

    const icon = root.querySelector('svg');
    // --color-danger resolves to hsl(var(--destructive-text)): the text role,
    // which is what an icon drawn on the page background needs.
    expect(icon).toHaveClass('text-danger');
  });

  it('paints a neutral notice with the muted frame and leaves the icon inheriting', () => {
    const root = renderNotice({ tone: 'neutral' });
    expect(root).toHaveClass('border-border/60', 'bg-muted/40', 'text-muted-foreground');
    expect(root.querySelector('svg')).not.toHaveClass('text-danger');
  });

  it('never dilutes the muted text token with an opacity modifier', () => {
    const root = renderNotice({ tone: 'danger' });
    expect(root.className).not.toMatch(/text-muted-foreground\//);
  });
});

describe('TranscriptNotice surface', () => {
  it('renders the framed surface with border chrome by default', () => {
    const root = renderNotice();
    expect(root).toHaveClass('rounded-lg', 'border', 'text-xs');
  });

  it('renders the bare surface with no frame chrome, for in-prose use', () => {
    const root = renderNotice({ surface: 'bare', tone: 'danger' });
    expect(root).toHaveClass('text-sm');
    expect(root).not.toHaveClass('rounded-lg');
    expect(root).not.toHaveClass('border-destructive/30');
    expect(root).not.toHaveClass('bg-destructive/5');
  });

  it('renders a paragraph with no action and a div once an action is present', () => {
    expect(renderNotice({ surface: 'bare' }).tagName).toBe('P');
    expect(
      renderNotice({
        action: { label: 'Retry', ariaLabel: 'Retry this turn', onClick: vi.fn() },
      }).tagName,
    ).toBe('DIV');
  });
});

describe('TranscriptNotice role', () => {
  it('carries no role by default, so it never becomes a second live region', () => {
    expect(renderNotice().getAttribute('role')).toBeNull();
  });

  it('applies role="status" when the call site asks for it', () => {
    expect(renderNotice({ role: 'status' })).toHaveAttribute('role', 'status');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('applies role="alert" when the call site asks for it', () => {
    expect(renderNotice({ role: 'alert' })).toHaveAttribute('role', 'alert');
  });
});

describe('TranscriptNotice action', () => {
  it('fires onClick and labels the button for assistive tech', () => {
    const onClick = vi.fn();
    renderNotice({
      action: { label: 'Retry', ariaLabel: 'Regenerate this response', icon: RefreshCw, onClick },
    });

    const button = screen.getByRole('button', { name: 'Regenerate this response' });
    expect(button).toHaveTextContent('Retry');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('gives the action a 24px minimum target', () => {
    renderNotice({
      action: { label: 'Retry', ariaLabel: 'Retry this turn', icon: RefreshCw, onClick: vi.fn() },
    });
    expect(screen.getByRole('button', { name: 'Retry this turn' })).toHaveClass(
      'min-h-6',
      'min-w-6',
    );
  });

  it('renders an actionSlot beside the action, and alone when there is no action', () => {
    const { unmount } = render(
      <TranscriptNotice
        icon={CircleAlert}
        message="Declined."
        actionSlot={<button type="button">Report issue</button>}
        action={{ label: 'Retry', ariaLabel: 'Regenerate this response', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Report issue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate this response' })).toBeInTheDocument();
    unmount();

    render(
      <TranscriptNotice
        icon={CircleAlert}
        message="Declined."
        actionSlot={<button type="button">Report issue</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Report issue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate this response' })).toBeNull();
  });

  it('renders no button at all when the call site passes no action', () => {
    renderNotice();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('TranscriptNotice message', () => {
  it('accepts a ReactNode message', () => {
    renderNotice({ message: <strong>Interrupted</strong> });
    expect(screen.getByText('Interrupted').tagName).toBe('STRONG');
  });
});
