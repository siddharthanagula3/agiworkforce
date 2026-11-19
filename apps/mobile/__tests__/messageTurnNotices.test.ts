import { webSearchNoticeForMessage } from '@/src/features/chat/components/messageTurnNotices';
import type { ChatMessage } from '@/types/chat';

const askedForSearch: ChatMessage = {
  id: 'answer-1',
  conversationId: 'conversation-1',
  role: 'assistant',
  content: 'The answer.',
  createdAt: '2026-11-15T10:00:00.000Z',
  metadata: { webSearchRequested: true, webSearchAskedInText: true },
};

function noticeFor(declinedSearch: boolean) {
  return webSearchNoticeForMessage({
    message: askedForSearch,
    activity: undefined,
    awaitingApproval: false,
    producedNoVisibleOutput: false,
    rendersResearchPlan: false,
    hasStreamError: false,
    declinedSearch,
    memoryCitationCount: 0,
    sourceCount: 0,
  });
}

describe('the web search notice for a mobile answer', () => {
  it('leaves the decision about a declined search to the shared rule', () => {
    expect(noticeFor(false)).toBe('not-invoked');
    expect(noticeFor(true)).toBeNull();
  });
});
