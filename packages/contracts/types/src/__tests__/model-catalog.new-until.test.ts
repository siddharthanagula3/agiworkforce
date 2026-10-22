import { describe, expect, it } from 'vitest';
import { isModelNew, listCanonicalModels } from '../model-catalog';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayOffset = (isoDay: string, days: number) => {
  const date = new Date(`${isoDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

describe('isModelNew', () => {
  const marked = listCanonicalModels().filter((model) => model.newUntil !== undefined);

  it('reads only well-formed newUntil days from the catalog', () => {
    expect(marked.length).toBeGreaterThan(0);
    for (const model of marked) expect(model.newUntil).toMatch(ISO_DAY);
  });

  it('is new through the newUntil day and not after it', () => {
    const model = marked[0]!;
    const newUntil = model.newUntil!;
    expect(isModelNew(model.id, dayOffset(newUntil, -1))).toBe(true);
    expect(isModelNew(model.id, new Date(`${newUntil}T23:59:59Z`))).toBe(true);
    expect(isModelNew(model.id, dayOffset(newUntil, 1))).toBe(false);
  });

  it('is never new for a model without newUntil or an unknown id', () => {
    const unmarked = listCanonicalModels().find((model) => model.newUntil === undefined)!;
    expect(isModelNew(unmarked.id, new Date(0))).toBe(false);
    expect(isModelNew('fixture-unknown-model', new Date())).toBe(false);
  });

  it('is not new for an invalid date', () => {
    expect(isModelNew(marked[0]!.id, new Date(Number.NaN))).toBe(false);
  });
});
