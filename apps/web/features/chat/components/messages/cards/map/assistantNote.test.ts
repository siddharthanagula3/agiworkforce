import { describe, expect, it } from 'vitest';
import { ASSISTANT_NOTE_MAX_LENGTH, assistantNoteForPlace } from './assistantNote';

describe('assistantNoteForPlace', () => {
  it('returns the sentence the answer wrote about that place, without markdown marks', () => {
    const answer =
      '1. **Blue Bottle Coffee** pours the cleanest filter on the block. Sightglass roasts in house.';

    expect(assistantNoteForPlace(answer, 'Blue Bottle Coffee')).toBe(
      'Blue Bottle Coffee pours the cleanest filter on the block.',
    );
  });

  it('matches on the head of a name that carries a location suffix', () => {
    const answer = 'Sightglass roasts in house and opens at seven.';

    expect(assistantNoteForPlace(answer, 'Sightglass, 270 7th St')).toBe(
      'Sightglass roasts in house and opens at seven.',
    );
  });

  it('returns nothing when the answer never mentions the place', () => {
    expect(assistantNoteForPlace('Three good options are listed below.', 'Blue Bottle')).toBeNull();
    expect(assistantNoteForPlace(undefined, 'Blue Bottle')).toBeNull();
  });

  it('caps a runaway sentence rather than filling the popup with it', () => {
    const long = `Blue Bottle ${'is very good '.repeat(60)}indeed.`;

    const note = assistantNoteForPlace(long, 'Blue Bottle');

    expect(note).not.toBeNull();
    expect((note as string).length).toBeLessThanOrEqual(ASSISTANT_NOTE_MAX_LENGTH + 1);
  });
});
