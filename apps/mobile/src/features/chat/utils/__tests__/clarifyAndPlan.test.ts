import type { ClarifyCardBody, InteractiveCard } from '@agiworkforce/types';
import {
  clarifyCardAcceptsResponse,
  clarifyCardNeedsResume,
  settledClarifyTurn,
} from '@/src/features/chat/utils/clarifyCard';
import {
  agiWorkPlanRetryMessage,
  parseAgiWorkPlanDelta,
  readAgiWorkPlanReview,
} from '@/src/features/chat/utils/agiWorkPlan';

function clarify(body: Partial<ClarifyCardBody>, extra: Partial<InteractiveCard> = {}) {
  return {
    schemaVersion: 1,
    cardId: 'card-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    fallback: { headline: 'A few questions', text: 'Answer below' },
    producedBy: { toolCallId: 'call-1', toolName: 'clarify' },
    recognized: true,
    kind: 'clarify.v1',
    body: {
      questions: [
        {
          id: 'q1',
          header: 'City',
          question: 'Which city?',
          options: [
            { id: 'a', label: 'Paris', description: '' },
            { id: 'b', label: 'Rome', description: '' },
          ],
          multiSelect: false,
          isOther: true,
          isSecret: false,
        },
      ],
      state: { status: 'pending' },
      ...body,
    },
    ...extra,
  } as InteractiveCard;
}

describe('clarify card helpers', () => {
  it('accepts a response only while pending and before the deadline', () => {
    expect(clarifyCardAcceptsResponse(clarify({}))).toBe(true);
    expect(
      clarifyCardAcceptsResponse(
        clarify(
          {},
          {
            interaction: {
              runId: 'run-1',
              awaitingResponse: true,
              expiresAt: '2026-09-01T00:01:00.000Z',
              executionMode: 'cloud_managed',
            },
          },
        ),
        Date.parse('2026-09-01T00:02:00.000Z'),
      ),
    ).toBe(false);
    expect(
      clarifyCardAcceptsResponse(
        clarify({ state: { status: 'dismissed', dismissedAt: '2026-09-01T00:00:00.000Z' } }),
      ),
    ).toBe(false);
  });

  it('describes answers in the same words the web client sends', () => {
    const answered = clarify({
      state: {
        status: 'answered',
        answeredAt: '2026-09-01T00:00:00.000Z',
        answers: [{ questionId: 'q1', kind: 'options', optionIds: ['a'], labels: ['Paris'] }],
      },
    });
    expect(clarifyCardNeedsResume(answered)).toBe(true);
    expect(settledClarifyTurn([answered])).toBe(
      'The user answered the clarifying questions:\n- Which city? Paris',
    );
    expect(
      settledClarifyTurn([
        clarify({ state: { status: 'dismissed', dismissedAt: '2026-09-01T00:00:00.000Z' } }),
      ]),
    ).toBe('The user declined the clarifying questions without answering.');
    expect(settledClarifyTurn([clarify({})])).toBeNull();
  });
});

describe('AGI Work plan helpers', () => {
  it('reads the streamed plan and its review', () => {
    const plan = parseAgiWorkPlanDelta({
      steps: [
        { id: 's1', description: 'Find sources', status: 'pending' },
        { id: 's1', description: 'Duplicate', status: 'pending' },
        { id: 's2', description: '', status: 'pending' },
      ],
      goal: { goal: 'Compare CRMs', constraints: ' ' },
      awaiting_approval: true,
    });
    expect(plan.steps).toEqual([{ id: 's1', description: 'Find sources', status: 'pending' }]);
    expect(plan.review).toEqual({ goal: { goal: 'Compare CRMs' }, awaitingApproval: true });
    expect(
      readAgiWorkPlanReview({ goal: { goal: 'Compare CRMs' }, awaitingApproval: false }),
    ).toEqual({ goal: { goal: 'Compare CRMs' }, awaitingApproval: false });
  });

  it('names the step a retry starts from', () => {
    expect(
      agiWorkPlanRetryMessage(1, { id: 's2', description: 'Write the report', status: 'failed' }),
    ).toBe('Retry step 2: Write the report');
  });
});
