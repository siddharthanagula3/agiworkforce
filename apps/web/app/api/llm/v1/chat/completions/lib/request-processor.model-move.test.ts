import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { autoModelMove } from './request-processor';

const decision = (modelKey: string) => ({ modelKey, reason: 'continuity' as const });

describe('autoModelMove, what the reader is told changed between Auto turns', () => {
  it('reports no model change when only the route serving the same model changed', () => {
    expect(autoModelMove('auto', { modelKey: 'fixture-model' }, decision('fixture-model'))).toEqual(
      { movedFromModel: null, movedReason: null },
    );
  });

  it('reports the model it moved from, with the router reason, when the model changed', () => {
    expect(
      autoModelMove(
        'auto',
        { modelKey: 'fixture-previous-model' },
        { modelKey: 'fixture-model', reason: 'capability_fallback' },
      ),
    ).toEqual({ movedFromModel: 'fixture-previous-model', movedReason: 'capability_fallback' });
  });

  it('claims no move on the first turn of a conversation', () => {
    expect(autoModelMove('auto', undefined, decision('fixture-model'))).toEqual({
      movedFromModel: null,
      movedReason: null,
    });
  });

  it('claims no Auto move for a model the user picked themselves', () => {
    expect(
      autoModelMove(
        'fixture-model',
        { modelKey: 'fixture-previous-model' },
        decision('fixture-model'),
      ),
    ).toEqual({ movedFromModel: null, movedReason: null });
  });
});
