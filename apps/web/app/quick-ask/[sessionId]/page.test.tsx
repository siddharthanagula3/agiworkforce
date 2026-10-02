import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type RlsDbModule = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({ rlsDb: vi.fn(), query: vi.fn(), webChatRoot: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getCurrentUserRlsDb: () => mocks.rlsDb(),
}));
vi.mock('@/features/chat/components/WebChatRoot', () => ({
  WebChatRoot: (props: { compact?: boolean }) => {
    mocks.webChatRoot(props);
    return <div data-testid="quick-ask-chat" />;
  },
}));

import Page, { generateMetadata } from './page';

const CONVERSATION_ID = '3b9d6f2e-8c4a-4e1b-9a7d-5f2c8e6b1a3d';

async function titleFor(sessionId: string) {
  return (await generateMetadata({ params: Promise.resolve({ sessionId }) })).title;
}

describe('/quick-ask/[sessionId]', () => {
  it('renders the compact chat root', () => {
    render(<Page />);

    expect(screen.getByTestId('quick-ask-chat')).toBeVisible();
    expect(mocks.webChatRoot).toHaveBeenLastCalledWith({ compact: true });
  });
});

describe('/quick-ask/[sessionId] tab title before the conversation loads', () => {
  it('names the tab after the conversation, read for its owner', async () => {
    mocks.rlsDb.mockResolvedValue({ db: { query: mocks.query }, userId: 'user-1' });
    mocks.query.mockResolvedValue([{ title: 'Pineapple identity check' }]);

    expect(await titleFor(CONVERSATION_ID)).toEqual({ absolute: 'Pineapple identity check · AGI' });
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toMatch(/user_id = \$2/);
    expect(params).toEqual([CONVERSATION_ID, 'user-1']);
  });

  it('says New chat, never the marketing title, when the title cannot be read', async () => {
    mocks.rlsDb.mockResolvedValue(null);

    expect(await titleFor(CONVERSATION_ID)).toEqual({ absolute: 'New chat · AGI' });
  });
});
