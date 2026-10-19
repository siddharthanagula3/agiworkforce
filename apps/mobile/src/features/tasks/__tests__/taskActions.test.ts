const mockConfirmShare = jest.fn();
const mockGetConversation = jest.fn();

jest.mock('@/src/features/shared-links/shareConversation', () => ({
  confirmShareConversation: (...args: unknown[]) => mockConfirmShare(...args),
}));
jest.mock('@/services/managedCloudChat', () => ({
  managedCloudChat: { getConversation: (...args: unknown[]) => mockGetConversation(...args) },
}));

import { isCloudRunSettled, rerunGoalFromRun, shareCloudRun } from '../taskActions';

const RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  conversationId: 'conv-1',
  conversationPreview: 'Draft the launch email',
  state: 'failed',
  model: 'model-1',
} as unknown as Parameters<typeof rerunGoalFromRun>[0];

describe('task actions on mobile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers to run a settled task again with its goal, never a live one', () => {
    expect(rerunGoalFromRun(RUN)).toBe('Draft the launch email');
    expect(rerunGoalFromRun({ ...RUN, state: 'running' })).toBeNull();
    expect(isCloudRunSettled({ state: 'cancelled' })).toBe(true);
    expect(isCloudRunSettled({ state: 'awaiting_input' })).toBe(false);
  });

  it('counts every ending the run contract names as settled, a timed-out run included', () => {
    expect(rerunGoalFromRun({ ...RUN, state: 'timed_out' })).toBe('Draft the launch email');
    expect(isCloudRunSettled({ state: 'archived' })).toBe(true);
    expect(isCloudRunSettled({ state: 'paused' })).toBe(false);
  });

  it('shares the task through a confirmed chat link built from its messages', async () => {
    mockGetConversation.mockResolvedValue({
      messages: [
        { role: 'user', content: 'Draft the launch email', createdAt: '2026-10-01T00:00:00.000Z' },
        { role: 'assistant', content: 'Here is a draft', createdAt: undefined },
      ],
    });
    shareCloudRun(RUN, 'Launch email', () => true);
    const input = mockConfirmShare.mock.calls[0][0];
    expect(input).toMatchObject({
      conversationId: 'conv-1',
      title: 'Launch email',
      modelId: 'model-1',
    });
    await expect(input.readMessages()).resolves.toEqual([
      { role: 'user', content: 'Draft the launch email', createdAt: '2026-10-01T00:00:00.000Z' },
      { role: 'assistant', content: 'Here is a draft' },
    ]);
    expect(mockGetConversation).toHaveBeenCalledWith('conv-1');
  });

  it('does nothing for a task with no chat', () => {
    shareCloudRun({ ...RUN, conversationId: null }, 'x', () => true);
    expect(mockConfirmShare).not.toHaveBeenCalled();
  });
});
