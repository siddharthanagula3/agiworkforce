import { routineDraftFromRun } from '../runPresentation';

const RUN = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conv-1',
  conversationPreview: 'Summarise overnight support tickets',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'completed',
  provider: 'managed',
  model: 'model-1',
  lastEventSequence: 4,
  cancellationRequestedAt: null,
  completedAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
} as unknown as Parameters<typeof routineDraftFromRun>[0];

describe('routine from a finished task', () => {
  it('drafts a schedule from a completed run with its prompt and model', () => {
    expect(routineDraftFromRun(RUN)).toEqual({
      prompt: 'Summarise overnight support tickets',
      model: 'model-1',
    });
  });

  it('offers nothing for a run still working or with no prompt', () => {
    expect(routineDraftFromRun({ ...RUN, state: 'running' })).toBeNull();
    expect(routineDraftFromRun({ ...RUN, conversationPreview: null })).toBeNull();
  });
});
