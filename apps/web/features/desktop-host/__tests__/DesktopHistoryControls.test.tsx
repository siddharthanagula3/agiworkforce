import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NEW_CHAT_PATH } from '@/features/chat/lib/new-chat-entry';
import { hostBridgeStub } from '@/test/host-bridge-stub';
import { DesktopHistoryControls } from '../components/DesktopHistoryControls';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('DesktopHistoryControls', () => {
  it('opens a new chat from the window control without sending the draft', () => {
    push.mockClear();
    const host = hostBridgeStub({
      navigation: {
        read: async () => ({ canGoBack: false, canGoForward: false }),
        go: async () => undefined,
        onChange: () => () => undefined,
      },
    });

    render(<DesktopHistoryControls host={host} />);
    fireEvent.click(screen.getByRole('button', { name: /New chat/ }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(NEW_CHAT_PATH);
  });
});
