import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitAppCommand } from '@shared/lib/app-commands';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useAdjacentChat } from '../hooks/use-adjacent-chat';

const push = vi.fn();
const pathname = vi.hoisted(() => ({ current: '/chat/middle' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname.current,
}));

function Harness() {
  useAdjacentChat();
  return null;
}

const conversations = [
  {
    id: 'newest',
    title: 'Newest',
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  },
  {
    id: 'middle',
    title: 'Middle',
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
  },
  {
    id: 'older',
    title: 'Older',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

describe('History on the public window', () => {
  beforeEach(() => {
    push.mockReset();
    pathname.current = '/chat/middle';
    useChatStore.setState({ conversations });
  });

  it('opens the older chat from Previous Chat', () => {
    render(<Harness />);

    emitAppCommand('previous-chat');

    expect(push).toHaveBeenCalledWith('/chat/older');
  });

  it('opens the newer chat from Next Chat', () => {
    render(<Harness />);

    emitAppCommand('next-chat');

    expect(push).toHaveBeenCalledWith('/chat/newest');
  });
});
