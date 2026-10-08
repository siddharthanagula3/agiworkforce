import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  deleteConversation: vi.fn(async (_id: string) => true),
  conversations: [] as Array<{ id: string; title: string }>,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: mocks.conversations,
    deleteConversation: mocks.deleteConversation,
  }),
}));

import { StudyPage } from './StudyPage';
import type { StudyApi } from '../services/study-api';
import type { StudySession } from '../lib/study-session';

function session(over: Partial<StudySession> = {}): StudySession {
  return {
    id: 'session-1',
    conversationId: '11111111-1111-4111-8111-111111111111',
    topic: 'Eigenvalues',
    mode: 'learn',
    level: 'beginner',
    startedAt: '2026-09-18T00:00:00.000Z',
    endedAt: null,
    ...over,
  };
}

function api(over: Partial<StudyApi> = {}): StudyApi {
  return {
    list: vi.fn(async () => []),
    forConversation: vi.fn(async () => null),
    start: vi.fn(async () => session()),
    end: vi.fn(async () => session({ endedAt: '2026-09-18T02:00:00.000Z' })),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conversations = [];
  mocks.deleteConversation.mockImplementation(async () => true);
});

describe('the entry point', () => {
  it('asks what is being studied, how and at what level', async () => {
    render(<StudyPage api={api()} createConversation={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Study' })).toBeVisible());
    expect(screen.getByPlaceholderText(/eigenvalues/i)).toBeVisible();
    expect(screen.getByRole('radio', { name: /Learn it/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Practise it/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Revise it/ })).toBeVisible();
    expect(screen.getByRole('combobox', { name: /Where you are with it/ })).toBeVisible();
  });

  it('titles the page with the shared pane title role', async () => {
    render(<StudyPage api={api()} createConversation={vi.fn()} />);

    const heading = await screen.findByRole('heading', { level: 1, name: 'Study' });
    expect(heading).toHaveClass('text-h1');
  });

  it('cannot start without a topic', async () => {
    render(<StudyPage api={api()} createConversation={vi.fn()} />);

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Study' })).toBeVisible());
    expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled();
  });

  it('shows what the model will be told before the session starts', async () => {
    const user = userEvent.setup();
    render(<StudyPage api={api()} createConversation={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/eigenvalues/i), 'The Krebs cycle');

    expect(screen.getByText(/The user is studying The Krebs cycle/)).toBeVisible();
  });
});

describe('starting a session', () => {
  it('creates a conversation, records the session and opens the conversation', async () => {
    const user = userEvent.setup();
    const createConversation = vi.fn(async () => '11111111-1111-4111-8111-111111111111');
    const studyApi = api();
    render(<StudyPage api={studyApi} createConversation={createConversation} />);

    await user.type(screen.getByPlaceholderText(/eigenvalues/i), 'Eigenvalues');
    await user.click(screen.getByRole('radio', { name: /Practise it/ }));
    await user.click(screen.getByRole('button', { name: 'Start studying' }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(createConversation).toHaveBeenCalledWith('Practise it: Eigenvalues');
    expect(studyApi.start).toHaveBeenCalledWith({
      conversationId: '11111111-1111-4111-8111-111111111111',
      topic: 'Eigenvalues',
      mode: 'practice',
      level: 'beginner',
    });
    expect(mocks.push).toHaveBeenCalledWith('/chat/11111111-1111-4111-8111-111111111111');
  });

  it('says so and stays put when the session cannot be started', async () => {
    const user = userEvent.setup();
    render(
      <StudyPage
        api={api({
          start: vi.fn(async () => {
            throw new Error('Study mode is unavailable right now.');
          }),
        })}
        createConversation={vi.fn(async () => '11111111-1111-4111-8111-111111111111')}
      />,
    );

    await user.type(screen.getByPlaceholderText(/eigenvalues/i), 'Eigenvalues');
    await user.click(screen.getByRole('button', { name: 'Start studying' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('history and exit', () => {
  it('has an empty state rather than an empty list', async () => {
    render(<StudyPage api={api()} createConversation={vi.fn()} />);

    expect(await screen.findByText(/Nothing yet/)).toBeVisible();
  });

  it('lists past sessions newest first and reopens one', async () => {
    const user = userEvent.setup();
    render(
      <StudyPage
        api={api({
          list: vi.fn(async () => [
            session({ id: 'a', topic: 'Older', startedAt: '2026-09-01T00:00:00.000Z' }),
            session({
              id: 'b',
              topic: 'Newer',
              conversationId: '22222222-2222-4222-8222-222222222222',
              startedAt: '2026-09-17T00:00:00.000Z',
            }),
          ]),
        })}
        createConversation={vi.fn()}
      />,
    );

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Newer');

    await user.click(screen.getByRole('button', { name: /^Newer/ }));
    expect(mocks.push).toHaveBeenCalledWith('/chat/22222222-2222-4222-8222-222222222222');
  });

  it('leaves study mode without touching the conversation', async () => {
    const user = userEvent.setup();
    const studyApi = api({ list: vi.fn(async () => [session()]) });
    render(<StudyPage api={studyApi} createConversation={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Leave study mode' }));

    expect(studyApi.end).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(studyApi.list).toHaveBeenCalledTimes(2);
  });

  it('offers no exit on a session that has already ended', async () => {
    render(
      <StudyPage
        api={api({ list: vi.fn(async () => [session({ endedAt: '2026-09-18T02:00:00.000Z' })]) })}
        createConversation={vi.fn()}
      />,
    );

    await screen.findByText('Eigenvalues');
    expect(screen.queryByRole('button', { name: 'Leave study mode' })).toBeNull();
  });

  it('reports a history that could not be loaded rather than showing an empty one silently', async () => {
    render(
      <StudyPage
        api={api({
          list: vi.fn(async () => {
            throw new Error('offline');
          }),
        })}
        createConversation={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});

describe('resuming an ended session', () => {
  it('turns study mode back on with the same topic, mode and level and opens the chat', async () => {
    const user = userEvent.setup();
    const studyApi = api({
      list: vi.fn(async () => [
        session({ mode: 'review', level: 'expert', endedAt: '2026-09-18T02:00:00.000Z' }),
      ]),
    });
    render(<StudyPage api={studyApi} createConversation={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Resume study mode' }));

    expect(studyApi.start).toHaveBeenCalledWith({
      conversationId: '11111111-1111-4111-8111-111111111111',
      topic: 'Eigenvalues',
      mode: 'review',
      level: 'expert',
    });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/chat/11111111-1111-4111-8111-111111111111'),
    );
  });

  it('offers no resume on a session that is still running', async () => {
    render(
      <StudyPage
        api={api({ list: vi.fn(async () => [session()]) })}
        createConversation={vi.fn()}
      />,
    );

    await screen.findByText('Eigenvalues');
    expect(screen.queryByRole('button', { name: 'Resume study mode' })).toBeNull();
  });

  it('stays put and says so when study mode cannot be turned back on', async () => {
    const user = userEvent.setup();
    render(
      <StudyPage
        api={api({
          list: vi.fn(async () => [session({ endedAt: '2026-09-18T02:00:00.000Z' })]),
          start: vi.fn(async () => {
            throw new Error('Study mode is unavailable right now.');
          }),
        })}
        createConversation={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Resume study mode' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('deleting a session', () => {
  it('asks first, naming the chat and that it cannot be recovered', async () => {
    const user = userEvent.setup();
    mocks.conversations = [
      { id: '11111111-1111-4111-8111-111111111111', title: 'Eigenvalues for the exam' },
    ];
    render(
      <StudyPage
        api={api({ list: vi.fn(async () => [session()]) })}
        createConversation={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Delete conversation: Eigenvalues' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Eigenvalues for the exam');
    expect(dialog).toHaveTextContent(/every message in it/);
    expect(dialog).toHaveTextContent(/cannot be undone/);
    expect(mocks.deleteConversation).not.toHaveBeenCalled();
  });

  it('deletes nothing when the question is cancelled', async () => {
    const user = userEvent.setup();
    render(
      <StudyPage
        api={api({ list: vi.fn(async () => [session()]) })}
        createConversation={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Delete conversation: Eigenvalues' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mocks.deleteConversation).not.toHaveBeenCalled();
    expect(screen.getByText('Eigenvalues')).toBeVisible();
  });

  it('deletes the conversation through the shared delete and drops the row', async () => {
    const user = userEvent.setup();
    render(
      <StudyPage
        api={api({ list: vi.fn(async () => [session({ endedAt: '2026-09-18T02:00:00.000Z' })]) })}
        createConversation={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Delete conversation: Eigenvalues' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Delete conversation' }));

    await waitFor(() =>
      expect(mocks.deleteConversation).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'),
    );
    expect(await screen.findByText(/Nothing yet/)).toBeVisible();
  });

  it('keeps the row when the delete fails', async () => {
    const user = userEvent.setup();
    mocks.deleteConversation.mockImplementation(async () => false);
    render(
      <StudyPage
        api={api({ list: vi.fn(async () => [session()]) })}
        createConversation={vi.fn()}
      />,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Delete conversation: Eigenvalues' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Delete conversation' }));

    await waitFor(() => expect(mocks.deleteConversation).toHaveBeenCalled());
    expect(screen.getByText('Eigenvalues')).toBeVisible();
  });
});
