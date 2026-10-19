import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/hooks/useConversations', () => ({
  useConversations: () => ({ conversations: [], deleteConversation: vi.fn() }),
}));

import { useChatProjectStore } from '@agiworkforce/unified-chat';
import { useChatStore } from '@shared/stores/web-chat-store';
import { StudyPage } from './StudyPage';
import type { StudyApi } from '../services/study-api';
import { composeStudyInstruction } from '../lib/study-session';

const CONVERSATION = '22222222-2222-4222-8222-222222222222';

function api(): StudyApi {
  return {
    list: vi.fn(async () => []),
    forConversation: vi.fn(async () => null),
    start: vi.fn(async (input) => ({
      id: 's1',
      conversationId: input.conversationId,
      topic: input.topic,
      mode: input.mode,
      level: input.level,
      startedAt: '2026-10-19T00:00:00.000Z',
      endedAt: null,
    })),
    end: vi.fn(),
  } as unknown as StudyApi;
}

beforeEach(() => {
  vi.clearAllMocks();
  useChatProjectStore.getState().setProjects([{ id: 'project-bio', name: 'Biology 101' } as never]);
});

describe('study course material and plans', () => {
  it('teaches with hints, worked examples, visuals and interactive quizzes', () => {
    const text = composeStudyInstruction({ topic: 'Cells', mode: 'practice', level: 'beginner' });
    expect(text).toContain('one hint at a time');
    expect(text).toContain('worked example step by step');
    expect(text).toContain('interactive explanation as an HTML artifact');
    expect(text).toContain('~~~quiz');
    expect(text).toContain('~~~flashcards');
    expect(text).toContain('numbered outline');
  });

  it('starts the session inside the chosen project and drafts a study plan request', async () => {
    const user = userEvent.setup();
    const createConversation = vi.fn(async () => CONVERSATION);
    render(<StudyPage api={api()} createConversation={createConversation} />);

    await user.type(screen.getByPlaceholderText(/eigenvalues/i), 'Cell biology');
    await user.selectOptions(screen.getByTestId('study-course-material'), 'project-bio');
    await user.click(screen.getByTestId('study-with-plan'));
    await user.click(screen.getByRole('button', { name: 'Start studying' }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/chat/${CONVERSATION}`));
    expect(createConversation).toHaveBeenCalledWith('Learn it: Cell biology', {
      projectId: 'project-bio',
    });
    expect(useChatStore.getState().getDraftContent(CONVERSATION)).toContain(
      'build me a personal study plan for Cell biology',
    );
  });
});
