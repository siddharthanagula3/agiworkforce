import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({
  default: () =>
    function WebChatPageStub() {
      return <div data-testid="web-chat-page">WebChatPage</div>;
    },
}));

vi.mock('@features/chat/pages/UnifiedChatPage', () => ({
  default: () => <div data-testid="unified-chat-page">UnifiedChatPage</div>,
}));

vi.mock('@features/chat/pages/WebChatPage', () => ({
  default: () => <div data-testid="web-chat-page">WebChatPage</div>,
}));

describe('/chat route', () => {
  it('always renders the canonical WebChatPage', async () => {
    const { default: Page } = await import('../../../../app/chat/page');

    render(<Page />);

    expect(screen.getByTestId('web-chat-page')).toBeDefined();
    expect(screen.queryByTestId('unified-chat-page')).toBeNull();
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
