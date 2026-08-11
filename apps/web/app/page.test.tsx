import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireCurrentTermsAcceptance: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: (...args: unknown[]) => mocks.auth(...args) }));
vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) =>
    mocks.requireCurrentTermsAcceptance(...args),
}));
vi.mock('@/features/chat/components/ChatStreamRuntimeProvider', () => ({
  ChatStreamRuntimeProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('@/features/chat/components/WebChatRoot', () => ({
  WebChatRoot: () => <div data-testid="web-chat-root" />,
}));
vi.mock('@/features/marketing/components/MarketingLanding', () => ({
  MarketingLanding: () => <div data-testid="marketing-landing" />,
}));

import Home from './page';

describe('root auth and terms gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentTermsAcceptance.mockResolvedValue(undefined);
  });

  it('preserves the marketing landing for signed-out visitors', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    render(await Home());

    expect(screen.getByTestId('marketing-landing')).toBeVisible();
    expect(mocks.requireCurrentTermsAcceptance).not.toHaveBeenCalled();
  });

  it('requires the current terms revision before rendering signed-in root chat', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user-1' });

    render(await Home());

    expect(mocks.requireCurrentTermsAcceptance).toHaveBeenCalledWith('user-1', '/');
    expect(screen.getByTestId('web-chat-root')).toBeVisible();
  });
});
