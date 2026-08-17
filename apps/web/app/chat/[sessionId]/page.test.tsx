import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dynamic: vi.fn() }));

vi.mock('next/dynamic', () => ({
  default: (...args: unknown[]) => {
    mocks.dynamic(...args);
    return () => <div data-testid="second-dynamic-wrapper" />;
  },
}));
vi.mock('@/features/chat/components/WebChatRoot', () => ({
  WebChatRoot: () => <div data-testid="web-chat-root" />,
}));

import Page from './page';

describe('/chat/[sessionId]', () => {
  it('renders the shared chat root instead of its own dynamic wrapper', () => {
    render(<Page />);

    expect(screen.getByTestId('web-chat-root')).toBeVisible();
    expect(screen.queryByTestId('second-dynamic-wrapper')).toBeNull();
    expect(mocks.dynamic).not.toHaveBeenCalled();
  });
});
