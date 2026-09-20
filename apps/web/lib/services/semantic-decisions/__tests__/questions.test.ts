import { describe, expect, it } from 'vitest';

import { TASK_FAMILIES } from '@agiworkforce/routing';

import { buildTurnSignalsRequest, TURN_SIGNALS_QUESTION_KEYS } from '../questions';

const MAX_STATE_CHARS = 4_000;

describe('the battery asked about a turn', () => {
  it('asks every question of the version once', () => {
    const request = buildTurnSignalsRequest({ latestUserMessage: 'rename these files' });

    expect(Object.keys(request.questions)).toEqual([...TURN_SIGNALS_QUESTION_KEYS]);
  });

  it('offers the router own family vocabulary rather than a copy of it', () => {
    const request = buildTurnSignalsRequest({ latestUserMessage: 'rename these files' });
    const family = request.questions['task_family'];

    expect(family?.kind).toBe('choice');
    expect(Object.keys(family?.kind === 'choice' ? family.options : {})).toEqual([
      ...TASK_FAMILIES,
    ]);
  });
});

describe('what fits in the state', () => {
  it('sends the latest turn alone when there is no previous one', () => {
    expect(buildTurnSignalsRequest({ latestUserMessage: '  hello  ' }).state).toBe('hello');
  });

  it('keeps the whole latest turn however long the previous one was', () => {
    const latest = 'now build that as a spreadsheet';

    const { state } = buildTurnSignalsRequest({
      latestUserMessage: latest,
      previousUserMessage: 'p'.repeat(40_000),
    });

    expect(state).toContain(latest);
    expect(state.endsWith(latest)).toBe(true);
    expect(state.length).toBeLessThanOrEqual(MAX_STATE_CHARS);
  });

  it('keeps both ends of a very long latest turn, because the ask is often last', () => {
    const latest = `FIRST${'x'.repeat(40_000)}LAST`;

    const { state } = buildTurnSignalsRequest({ latestUserMessage: latest });

    expect(state.startsWith('FIRST')).toBe(true);
    expect(state.endsWith('LAST')).toBe(true);
    expect(state).toContain('[...]');
    expect(state.length).toBeLessThanOrEqual(MAX_STATE_CHARS);
  });

  it('never exceeds the cap with both turns long', () => {
    const { state } = buildTurnSignalsRequest({
      latestUserMessage: `FIRST${'x'.repeat(40_000)}LAST`,
      previousUserMessage: 'p'.repeat(40_000),
    });

    expect(state.length).toBeLessThanOrEqual(MAX_STATE_CHARS);
    expect(state.startsWith('Previous request: ')).toBe(true);
    expect(state.endsWith('LAST')).toBe(true);
  });

  it('carries nothing but the two turns', () => {
    const { state } = buildTurnSignalsRequest({
      latestUserMessage: 'latest words',
      previousUserMessage: 'previous words',
    });

    expect(state).toBe('Previous request: previous words\n\nMost recent request: latest words');
  });
});
