import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function WebChatPageStub() {
      return <div data-testid="web-chat-page">WebChatPage</div>;
    },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => routeMocks.auth(),
}));

vi.mock('next/headers', () => ({
  headers: () => routeMocks.headers(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => routeMocks.redirect(url),
}));

vi.mock('@features/chat/pages/UnifiedChatPage', () => ({
  default: () => <div data-testid="unified-chat-page">UnifiedChatPage</div>,
}));

vi.mock('@features/chat/pages/WebChatPage', () => ({
  default: () => <div data-testid="web-chat-page">WebChatPage</div>,
}));

beforeEach(() => {
  routeMocks.auth.mockResolvedValue({ userId: 'user_123' });
  routeMocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/chat' }));
  routeMocks.redirect.mockReset();
});

describe('/chat route', () => {
  it('always renders the canonical WebChatPage', async () => {
    const { default: Page } = await import('../../../../app/chat/page');

    render(<Page />);

    expect(screen.getByTestId('web-chat-page')).toBeDefined();
    expect(screen.queryByTestId('unified-chat-page')).toBeNull();
  });

  it('preserves the requested chat session path when redirecting signed-out users', async () => {
    routeMocks.auth.mockResolvedValue({ userId: null });
    routeMocks.headers.mockResolvedValue(
      new Headers({ 'x-agi-pathname': '/chat/session-123?panel=artifacts' }),
    );
    const { default: ChatLayout } = await import('../../../../app/chat/layout');

    await ChatLayout({ children: <div>Chat</div> });

    expect(routeMocks.redirect).toHaveBeenCalledWith(
      '/login?redirectTo=%2Fchat%2Fsession-123%3Fpanel%3Dartifacts',
    );
  });

  it('falls back to /chat when the forwarded path is not a chat path', async () => {
    routeMocks.auth.mockResolvedValue({ userId: null });
    routeMocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/settings' }));
    const { default: ChatLayout } = await import('../../../../app/chat/layout');

    await ChatLayout({ children: <div>Chat</div> });

    expect(routeMocks.redirect).toHaveBeenCalledWith('/login?redirectTo=%2Fchat');
  });
});

describe('WebChatRuntime', () => {
  it('instantiates without throwing', async () => {
    vi.doMock('@/services/cloudDb', () => ({
      getNeonClient: () => ({
        auth: {
          getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
        },
      }),
    }));

    const { WebChatRuntime } = await import('@/lib/runtime/WebChatRuntime');
    expect(() => new WebChatRuntime()).not.toThrow();
  });
});
