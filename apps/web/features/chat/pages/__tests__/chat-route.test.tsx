import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  requireCurrentTermsAcceptance: vi.fn(),
  webChatRoot: vi.fn(),
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

vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) =>
    routeMocks.requireCurrentTermsAcceptance(...args),
}));

vi.mock('@/features/chat/components/WebChatRoot', () => ({
  WebChatRoot: (props: { initialWorkMode?: string }) => {
    routeMocks.webChatRoot(props);
    return <div data-testid="web-chat-page">WebChatPage</div>;
  },
}));

vi.mock('@/features/chat/components/ChatStreamRuntimeProvider', () => ({
  ChatStreamRuntimeProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));

beforeEach(() => {
  routeMocks.auth.mockResolvedValue({ userId: 'user_123' });
  routeMocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/chat' }));
  routeMocks.redirect.mockReset();
  routeMocks.requireCurrentTermsAcceptance.mockResolvedValue(undefined);
  routeMocks.webChatRoot.mockReset();
});

describe('/chat route', () => {
  it('always renders the canonical WebChatPage', async () => {
    const { default: Page } = await import('../../../../app/chat/page');

    render(await Page());

    expect(screen.getByTestId('web-chat-page')).toBeDefined();
    expect(screen.queryByTestId('unified-chat-page')).toBeNull();
  });

  it('leaves the work mode unset on a plain /chat visit', async () => {
    routeMocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/chat' }));
    const { default: Page } = await import('../../../../app/chat/page');

    render(await Page());

    expect(routeMocks.webChatRoot).toHaveBeenCalledWith({ initialWorkMode: undefined });
  });

  it('preselects AGI Work when the proxy rewrote a signed-in /agi-work visit here', async () => {
    routeMocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/agi-work' }));
    const { default: Page } = await import('../../../../app/chat/page');

    render(await Page());

    expect(routeMocks.webChatRoot).toHaveBeenCalledWith({ initialWorkMode: 'agiwork' });
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

  it('enforces current terms against the exact requested chat path', async () => {
    routeMocks.headers.mockResolvedValue(
      new Headers({ 'x-agi-pathname': '/chat/session-123?panel=artifacts' }),
    );
    const { default: ChatLayout } = await import('../../../../app/chat/layout');

    await ChatLayout({ children: <div>Chat</div> });

    expect(routeMocks.requireCurrentTermsAcceptance).toHaveBeenCalledWith(
      'user_123',
      '/chat/session-123?panel=artifacts',
    );
  });
});
