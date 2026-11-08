import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitAppCommand } from '@shared/lib/app-commands';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useTemporaryChat } from '../hooks/use-temporary-chat';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function Harness() {
  useTemporaryChat();
  return null;
}

describe('New Temporary Chat on the public window', () => {
  beforeEach(() => {
    push.mockReset();
    useChatStore.setState({ pendingTemporaryChat: null });
  });

  it('opens a new chat and arms the temporary flag the composer already reads', () => {
    render(<Harness />);

    emitAppCommand('new-temporary-chat');

    expect(useChatStore.getState().pendingTemporaryChat).toBe(true);
    expect(push).toHaveBeenCalledWith('/chat');
  });
});
