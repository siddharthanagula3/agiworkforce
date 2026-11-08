import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge, HostCommand } from '@agiworkforce/local-runtime-contract';
import { DesktopChatTabs } from '../components/DesktopChatTabs';
import { useHostCommands } from '../hooks/use-host-commands';
import { useOpenChatTabs } from '../hooks/use-open-chat-tabs';
import { resetChatTabs } from '../lib/chat-tab-strip';

const push = vi.fn();
const pathname = vi.hoisted(() => ({ current: '/chat/one' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname.current,
}));

let deliver: ((command: HostCommand) => void) | null = null;

function fakeHost(): HostBridge {
  return {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    onHostCommand: (callback: (command: HostCommand) => void) => {
      deliver = callback;
      return () => {
        deliver = null;
      };
    },
  } as unknown as HostBridge;
}

function Harness() {
  useHostCommands(fakeHost());
  useOpenChatTabs();
  return <DesktopChatTabs />;
}

describe('Show Tabs on the public window', () => {
  beforeEach(() => {
    push.mockReset();
    pathname.current = '/chat/one';
    deliver = null;
    resetChatTabs();
  });

  it('lists the chats this window has opened and opens the one that is chosen', () => {
    const view = render(<Harness />);
    expect(screen.queryByRole('navigation', { name: 'Open tabs' })).toBeNull();

    act(() => {
      deliver?.('toggle-chat-tabs');
    });
    expect(screen.getByRole('navigation', { name: 'Open tabs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'one' })).toBeTruthy();

    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    expect(screen.getByRole('button', { name: 'two' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'one' }));
    expect(push).toHaveBeenCalledWith('/chat/one');
  });

  it('reopens the chat that was just closed', () => {
    const view = render(<Harness />);
    act(() => {
      deliver?.('toggle-chat-tabs');
    });
    pathname.current = '/chat/two';
    view.rerender(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Close one' }));
    expect(screen.queryByRole('button', { name: 'one' })).toBeNull();

    act(() => {
      deliver?.('reopen-closed-tab');
    });

    expect(screen.getByRole('button', { name: 'one' })).toBeTruthy();
    expect(push).toHaveBeenCalledWith('/chat/one');
  });

  it('opens the leftmost chat when the public window asks for the first tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-first-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/one');
  });

  it('closes the open tabs to the right of the one this window is showing', () => {
    const view = render(<Harness />);
    act(() => {
      deliver?.('toggle-chat-tabs');
    });
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('close-tabs-to-the-right');
    });

    expect(screen.getByRole('button', { name: 'one' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'two' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'three' })).toBeNull();
  });

  it('closes every open tab except the one this window is showing', () => {
    const view = render(<Harness />);
    act(() => {
      deliver?.('toggle-chat-tabs');
    });
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('close-other-tabs');
    });

    expect(screen.getByRole('button', { name: 'three' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'one' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'two' })).toBeNull();
  });

  it('closes the chat this window is showing', () => {
    const view = render(<Harness />);
    act(() => {
      deliver?.('toggle-chat-tabs');
    });
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    expect(screen.getByRole('button', { name: 'two' })).toBeTruthy();

    act(() => {
      deliver?.('close-active-tab');
    });

    expect(screen.queryByRole('button', { name: 'two' })).toBeNull();
    expect(screen.getByRole('button', { name: 'one' })).toBeTruthy();
  });

  it('opens the second chat when the public window asks for the second tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-second-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/two');
  });

  it('opens the third chat when the public window asks for the third tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);
    pathname.current = '/chat/four';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-third-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/three');
  });

  it('opens the fourth chat when the public window asks for the fourth tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);
    pathname.current = '/chat/four';
    view.rerender(<Harness />);
    pathname.current = '/chat/five';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-fourth-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/four');
  });

  it('opens the fifth chat when the public window asks for the fifth tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);
    pathname.current = '/chat/four';
    view.rerender(<Harness />);
    pathname.current = '/chat/five';
    view.rerender(<Harness />);
    pathname.current = '/chat/six';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-fifth-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/five');
  });

  it('opens the sixth chat when the public window asks for the sixth tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);
    pathname.current = '/chat/four';
    view.rerender(<Harness />);
    pathname.current = '/chat/five';
    view.rerender(<Harness />);
    pathname.current = '/chat/six';
    view.rerender(<Harness />);
    pathname.current = '/chat/seven';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-sixth-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/six');
  });

  it('opens the seventh chat when the public window asks for the seventh tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);
    pathname.current = '/chat/four';
    view.rerender(<Harness />);
    pathname.current = '/chat/five';
    view.rerender(<Harness />);
    pathname.current = '/chat/six';
    view.rerender(<Harness />);
    pathname.current = '/chat/seven';
    view.rerender(<Harness />);
    pathname.current = '/chat/eight';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-seventh-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/seven');
  });

  it('opens the eighth chat when the public window asks for the eighth tab', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/three';
    view.rerender(<Harness />);
    pathname.current = '/chat/four';
    view.rerender(<Harness />);
    pathname.current = '/chat/five';
    view.rerender(<Harness />);
    pathname.current = '/chat/six';
    view.rerender(<Harness />);
    pathname.current = '/chat/seven';
    view.rerender(<Harness />);
    pathname.current = '/chat/eight';
    view.rerender(<Harness />);
    pathname.current = '/chat/nine';
    view.rerender(<Harness />);

    act(() => {
      deliver?.('focus-eighth-tab');
    });

    expect(push).toHaveBeenCalledWith('/chat/eight');
  });
});
