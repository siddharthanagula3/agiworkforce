import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  requireCurrentTermsAcceptance: vi.fn(),
  webChatRoot: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => mocks.headers() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => mocks.redirect(url) }));
vi.mock('@/lib/server/identity', () => ({
  getRequestIdentity: () => mocks.getRequestIdentity(),
}));
vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) =>
    mocks.requireCurrentTermsAcceptance(...args),
}));
vi.mock('@/features/chat/components/ChatStreamRuntimeProvider', () => ({
  ChatStreamRuntimeProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('@/features/chat/components/WebChatRoot', () => ({
  WebChatRoot: (props: { compact?: boolean }) => {
    mocks.webChatRoot(props);
    return <div data-testid="quick-ask-chat" />;
  },
}));

import QuickAskLayout from './layout';
import QuickAskPage from './page';
import QuickAskConversationPage from './[sessionId]/page';

describe('/quick-ask route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestIdentity.mockResolvedValue({ subject: 'user-1' });
    mocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/quick-ask/session-1' }));
    mocks.requireCurrentTermsAcceptance.mockResolvedValue(undefined);
  });

  it('renders the compact chat root for new and existing conversations', () => {
    const { rerender } = render(<QuickAskPage />);
    expect(screen.getByTestId('quick-ask-chat')).toBeVisible();
    expect(mocks.webChatRoot).toHaveBeenLastCalledWith({ compact: true });

    rerender(<QuickAskConversationPage />);
    expect(mocks.webChatRoot).toHaveBeenLastCalledWith({ compact: true });
  });

  it('enforces current terms against the exact Quick Ask URL', async () => {
    await QuickAskLayout({ children: <div>Quick Ask</div> });

    expect(mocks.requireCurrentTermsAcceptance).toHaveBeenCalledWith(
      'user-1',
      '/quick-ask/session-1',
    );
  });

  it('preserves the Quick Ask URL when recovering an expired session', async () => {
    mocks.getRequestIdentity.mockResolvedValue({ subject: null });

    await QuickAskLayout({ children: <div>Quick Ask</div> });

    expect(mocks.redirect).toHaveBeenCalledWith(
      '/session-expired?redirectTo=%2Fquick-ask%2Fsession-1',
    );
  });
});
