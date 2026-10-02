import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type RlsDbModule = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({ dynamic: vi.fn(), rlsDb: vi.fn(), query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getCurrentUserRlsDb: () => mocks.rlsDb(),
}));
vi.mock('next/dynamic', () => ({
  default: (...args: unknown[]) => {
    mocks.dynamic(...args);
    return () => <div data-testid="second-dynamic-wrapper" />;
  },
}));
vi.mock('@/features/chat/components/WebChatRoot', () => ({
  WebChatRoot: () => <div data-testid="web-chat-root" />,
}));

import Page, { generateMetadata } from './page';

const CONVERSATION_ID = '3b9d6f2e-8c4a-4e1b-9a7d-5f2c8e6b1a3d';

async function titleFor(sessionId: string) {
  return (await generateMetadata({ params: Promise.resolve({ sessionId }) })).title;
}

describe('/chat/[sessionId]', () => {
  it('renders the shared chat root instead of its own dynamic wrapper', () => {
    render(<Page />);

    expect(screen.getByTestId('web-chat-root')).toBeVisible();
    expect(screen.queryByTestId('second-dynamic-wrapper')).toBeNull();
    expect(mocks.dynamic).not.toHaveBeenCalled();
  });
});

describe('/chat/[sessionId] tab title before the conversation loads', () => {
  it('names the tab after the conversation, read for its owner', async () => {
    mocks.rlsDb.mockResolvedValue({ db: { query: mocks.query }, userId: 'user-1' });
    mocks.query.mockResolvedValue([{ title: 'Pineapple identity check' }]);

    expect(await titleFor(CONVERSATION_ID)).toEqual({ absolute: 'Pineapple identity check · AGI' });
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/deleted_at is null/);
    expect(params).toEqual([CONVERSATION_ID, 'user-1']);
  });

  it('says New chat, never the marketing title, when the title cannot be read', async () => {
    mocks.rlsDb.mockResolvedValue(null);

    expect(await titleFor(CONVERSATION_ID)).toEqual({ absolute: 'New chat · AGI' });
  });

  it('does not query for an address that is not a conversation id', async () => {
    mocks.rlsDb.mockResolvedValue({ db: { query: mocks.query }, userId: 'user-1' });

    expect(await titleFor('not-a-conversation')).toEqual({ absolute: 'New chat · AGI' });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
