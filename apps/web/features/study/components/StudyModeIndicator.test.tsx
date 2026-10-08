import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StudyModeIndicator } from './StudyModeIndicator';
import { useConversationStudySession } from '../hooks/use-conversation-study-session';
import type { StudyApi } from '../services/study-api';
import type { StudySession } from '../lib/study-session';

const CONVERSATION = '11111111-1111-4111-8111-111111111111';

function session(over: Partial<StudySession> = {}): StudySession {
  return {
    id: 'session-1',
    conversationId: CONVERSATION,
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
    forConversation: vi.fn(async () => session()),
    start: vi.fn(async () => session()),
    end: vi.fn(async () => session({ endedAt: '2026-09-18T02:00:00.000Z' })),
    ...over,
  };
}

function Harness({
  conversationId,
  studyApi,
}: {
  conversationId: string | null;
  studyApi: StudyApi;
}) {
  return <StudyModeIndicator {...useConversationStudySession(conversationId, studyApi)} />;
}

describe('the study mode indicator in a chat', () => {
  it('names the topic and the way it is being studied', async () => {
    render(<Harness conversationId={CONVERSATION} studyApi={api()} />);

    expect(await screen.findByText('Studying: Eigenvalues')).toBeVisible();
    expect(screen.getByTestId('study-mode-indicator')).toHaveTextContent('Learn it');
  });

  it('says that leaving keeps the chat', async () => {
    render(<Harness conversationId={CONVERSATION} studyApi={api()} />);

    const leave = await screen.findByRole('button', { name: 'Leave study mode' });
    expect(leave).toHaveAccessibleDescription(
      'Turns off tutoring for this chat. The chat and its messages stay.',
    );
  });

  it('renders nothing for a chat that is not a study session', async () => {
    const studyApi = api({ forConversation: vi.fn(async () => null) });
    render(<Harness conversationId={CONVERSATION} studyApi={studyApi} />);

    await waitFor(() => expect(studyApi.forConversation).toHaveBeenCalled());
    expect(screen.queryByTestId('study-mode-indicator')).toBeNull();
  });

  it('asks nothing for a chat that cannot carry a session', () => {
    const studyApi = api();
    render(<Harness conversationId={null} studyApi={studyApi} />);

    expect(studyApi.forConversation).not.toHaveBeenCalled();
    expect(screen.queryByTestId('study-mode-indicator')).toBeNull();
  });

  it('stays quiet on a chat whose session was ended earlier', async () => {
    const studyApi = api({
      forConversation: vi.fn(async () => session({ endedAt: '2026-09-18T02:00:00.000Z' })),
    });
    render(<Harness conversationId={CONVERSATION} studyApi={studyApi} />);

    await waitFor(() => expect(studyApi.forConversation).toHaveBeenCalled());
    expect(screen.queryByTestId('study-mode-indicator')).toBeNull();
  });

  it('leaves study mode and offers to turn it back on', async () => {
    const user = userEvent.setup();
    const studyApi = api();
    render(<Harness conversationId={CONVERSATION} studyApi={studyApi} />);

    await user.click(await screen.findByRole('button', { name: 'Leave study mode' }));

    expect(studyApi.end).toHaveBeenCalledWith(CONVERSATION);
    expect(await screen.findByText(/Study mode is off/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Turn study mode back on' }));

    expect(studyApi.start).toHaveBeenCalledWith({
      conversationId: CONVERSATION,
      topic: 'Eigenvalues',
      mode: 'learn',
      level: 'beginner',
    });
    expect(await screen.findByText('Studying: Eigenvalues')).toBeVisible();
  });

  it('keeps study mode on and says so when leaving fails', async () => {
    const user = userEvent.setup();
    const studyApi = api({
      end: vi.fn(async () => {
        throw new Error('Study mode is unavailable right now.');
      }),
    });
    render(<Harness conversationId={CONVERSATION} studyApi={studyApi} />);

    await user.click(await screen.findByRole('button', { name: 'Leave study mode' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
    expect(screen.getByText('Studying: Eigenvalues')).toBeVisible();
  });

  it('drops the previous chat session when the chat changes', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const studyApi = api({
      forConversation: vi.fn(async (id: string) => (id === CONVERSATION ? session() : null)),
    });
    const { rerender } = render(<Harness conversationId={CONVERSATION} studyApi={studyApi} />);
    await screen.findByText('Studying: Eigenvalues');

    rerender(<Harness conversationId={other} studyApi={studyApi} />);

    await waitFor(() => expect(studyApi.forConversation).toHaveBeenCalledWith(other));
    expect(screen.queryByTestId('study-mode-indicator')).toBeNull();
  });
});
