import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPendingDraft,
  parkPendingDraft,
  restorablePendingDraft,
} from './pending-composer-draft';

const DRAFT = 'half-typed draft that belongs to this chat';
const NOTHING_IN_MEMORY = '';

function stepBack() {
  window.dispatchEvent(new PopStateEvent('popstate'));
}

afterEach(() => {
  window.sessionStorage.clear();
  // Spend any step a test left behind so it cannot leak into the next one.
  restorablePendingDraft(NOTHING_IN_MEMORY);
});

/**
 * Both of these are required product behaviour on the SAME draft slot, which
 * is why the navigation has to be what tells them apart.
 */
describe('pending composer draft', () => {
  it('gives the draft back when the user steps back to it', () => {
    parkPendingDraft(DRAFT);

    stepBack();

    expect(restorablePendingDraft(NOTHING_IN_MEMORY)).toBe(DRAFT);
  });

  it('withholds it from a new chat the user opened on purpose', () => {
    parkPendingDraft(DRAFT);

    expect(restorablePendingDraft(NOTHING_IN_MEMORY)).toBe('');
  });

  it('keeps the draft parked when it withholds it, so a later step back still finds it', () => {
    parkPendingDraft(DRAFT);
    expect(restorablePendingDraft(NOTHING_IN_MEMORY)).toBe('');

    stepBack();

    expect(restorablePendingDraft(NOTHING_IN_MEMORY)).toBe(DRAFT);
  });

  it('spends the step, so only the composer that arrived on it is served', () => {
    parkPendingDraft(DRAFT);
    stepBack();

    expect(restorablePendingDraft(NOTHING_IN_MEMORY)).toBe(DRAFT);
    expect(restorablePendingDraft(NOTHING_IN_MEMORY)).toBe('');
  });

  it('prefers the store when the navigation was soft enough to keep it', () => {
    parkPendingDraft('stale copy in storage');
    stepBack();

    expect(restorablePendingDraft('fresher copy still in memory')).toBe(
      'fresher copy still in memory',
    );
  });

  it('forgets a draft that was sent', () => {
    parkPendingDraft(DRAFT);
    clearPendingDraft();
    stepBack();

    expect(restorablePendingDraft(NOTHING_IN_MEMORY)).toBe('');
  });
});
