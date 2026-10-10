import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VoiceChatDock } from './VoiceChatDock';

const VIEWPORT_HEIGHT = 800;
const TRIGGER_RECT = {
  left: 120,
  right: 156,
  top: 640,
  bottom: 676,
  width: 36,
  height: 36,
  x: 120,
  y: 640,
  toJSON: () => ({}),
};

function Harness({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (node) node.getBoundingClientRect = () => TRIGGER_RECT as DOMRect;
        }}
        type="button"
        aria-label="Open this chat panel"
        onClick={() => setOpen((value) => !value)}
      >
        +
      </button>
      <VoiceChatDock
        open={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        onNewChat={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenConnectors={vi.fn()}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('VoiceChatDock', () => {
  it('opens above its plus button instead of in the corner of the page', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
    render(<Harness />);

    const menu = screen.getByTestId('voice-chat-dock');
    const panel = menu.closest('[role="dialog"]') as HTMLElement;
    expect(panel.style.position).toBe('fixed');
    expect(panel.style.left).toBe(`${TRIGGER_RECT.left}px`);
    expect(panel.style.bottom).toBe(`${VIEWPORT_HEIGHT - TRIGGER_RECT.top + 8}px`);
    expect(panel.className).not.toMatch(/\btop-16\b/);
    expect(panel.className).not.toMatch(/\bend-4\b/);
    expect(menu.getAttribute('role')).toBe('menu');
  });

  it('closes from its own trigger rather than reopening on the same click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByTestId('voice-chat-dock')).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByLabelText('Open this chat panel'));
    });

    expect(screen.queryByTestId('voice-chat-dock')).toBeNull();
  });
});
