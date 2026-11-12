const mockConfirmShare = jest.fn();
const mockGetConversation = jest.fn();

jest.mock('@/src/features/shared-links/shareConversation', () => ({
  confirmShareConversation: (...args: unknown[]) => mockConfirmShare(...args),
}));
jest.mock('@/services/managedCloudChat', () => ({
  managedCloudChat: { getConversation: (...args: unknown[]) => mockGetConversation(...args) },
}));

import { canRerunCloudRun, isCloudRunSettled, loadRerunGoal, shareCloudRun } from '../taskActions';

const RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  conversationId: 'conv-1',
  conversationPreview: 'Draft the launch email',
  state: 'failed',
  model: 'model-1',
  createdAt: '2026-10-01T00:00:10.000Z',
} as unknown as Parameters<typeof loadRerunGoal>[0];

describe('task actions on mobile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers to run a settled task with a chat again, never a live one', () => {
    expect(canRerunCloudRun(RUN)).toBe(true);
    expect(canRerunCloudRun({ ...RUN, state: 'running' })).toBe(false);
    expect(canRerunCloudRun({ ...RUN, conversationId: null })).toBe(false);
    expect(isCloudRunSettled({ state: 'cancelled' })).toBe(true);
    expect(isCloudRunSettled({ state: 'awaiting_input' })).toBe(false);
  });

  it('counts every ending the run contract names as settled, a timed-out run included', () => {
    expect(canRerunCloudRun({ ...RUN, state: 'timed_out' })).toBe(true);
    expect(isCloudRunSettled({ state: 'archived' })).toBe(true);
    expect(isCloudRunSettled({ state: 'paused' })).toBe(false);
  });

  it('reruns the full original request, not the 200-character list preview', async () => {
    const fullGoal = 'Compare both vendors across price, support and security. '.repeat(12).trim();
    mockGetConversation.mockResolvedValue({
      messages: [{ role: 'user', content: fullGoal, createdAt: '2026-10-01T00:00:00.000Z' }],
      hasMore: false,
    });

    await expect(loadRerunGoal(RUN)).resolves.toBe(fullGoal);
    expect(fullGoal.length).toBeGreaterThan(200);
  });

  it('picks the request that started this run when a chat holds several', async () => {
    mockGetConversation.mockResolvedValue({
      messages: [
        { role: 'user', content: 'First question', createdAt: '2026-09-01T00:00:00.000Z' },
        { role: 'assistant', content: 'Answer', createdAt: '2026-09-01T00:01:00.000Z' },
        { role: 'user', content: 'Draft the launch email', createdAt: '2026-10-01T00:00:09.000Z' },
        {
          role: 'user',
          content: 'Thanks, now something else',
          createdAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      hasMore: false,
    });

    await expect(loadRerunGoal(RUN)).resolves.toBe('Draft the launch email');
  });

  it('keeps reading pages until the request that started the run is found', async () => {
    mockGetConversation
      .mockResolvedValueOnce({
        messages: [{ role: 'user', content: 'Old', createdAt: '2026-09-01T00:00:00.000Z' }],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        messages: [
          { role: 'user', content: 'The real goal', createdAt: '2026-10-01T00:00:10.000Z' },
        ],
        hasMore: false,
      });

    await expect(loadRerunGoal(RUN)).resolves.toBe('The real goal');
    expect(mockGetConversation).toHaveBeenNthCalledWith(
      2,
      'conv-1',
      expect.objectContaining({ offset: 1 }),
      {},
    );
  });

  it('never reads a live task or one with no chat', async () => {
    await expect(loadRerunGoal({ ...RUN, state: 'running' })).resolves.toBeNull();
    await expect(loadRerunGoal({ ...RUN, conversationId: null })).resolves.toBeNull();
    expect(mockGetConversation).not.toHaveBeenCalled();
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
