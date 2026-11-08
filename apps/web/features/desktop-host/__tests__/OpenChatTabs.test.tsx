import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitAppCommand } from '@shared/lib/app-commands';
import { NEW_CHAT_PATH } from '@/features/chat/lib/new-chat-entry';
import { useOpenChatTabs } from '../hooks/use-open-chat-tabs';
import { resetChatTabs } from '../lib/chat-tab-strip';

const push = vi.fn();
const pathname = vi.hoisted(() => ({ current: '/chat/one' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname.current,
}));

function Harness() {
  useOpenChatTabs();
  return null;
}

describe('View tab steps on the public window', () => {
  beforeEach(() => {
    push.mockReset();
    pathname.current = '/chat/one';
    resetChatTabs();
  });

  it('opens the previous tab after a second chat was opened', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);

    emitAppCommand('previous-tab');

    expect(push).toHaveBeenCalledWith('/chat/one');
  });

  it('opens the next tab after returning to the first chat', () => {
    const view = render(<Harness />);
    pathname.current = '/chat/two';
    view.rerender(<Harness />);
    pathname.current = '/chat/one';
    view.rerender(<Harness />);

    emitAppCommand('next-tab');

    expect(push).toHaveBeenCalledWith('/chat/two');
  });

  it('opens a new chat when New Tab reaches the public window', () => {
    render(<Harness />);

    emitAppCommand('new-tab');

    expect(push).toHaveBeenCalledWith(NEW_CHAT_PATH);
  });
});
