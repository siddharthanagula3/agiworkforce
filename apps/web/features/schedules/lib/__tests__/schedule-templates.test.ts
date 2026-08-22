import { describe, expect, it } from 'vitest';

import { SCHEDULE_TEMPLATES } from '../schedule-templates';
import { INITIAL_SCHEDULE_DRAFT } from '../schedule-form';

// A template is a starting point for the create dialog. Every field it sets has
// to be one the form actually reads, or the card silently drops half of what it
// promised on the tile.
describe('schedule templates', () => {
  it('offers a gallery rather than a single suggestion', () => {
    expect(SCHEDULE_TEMPLATES.length).toBeGreaterThanOrEqual(6);
  });

  it('has unique ids', () => {
    const ids = SCHEDULE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only sets keys the draft actually has', () => {
    const known = new Set(Object.keys(INITIAL_SCHEDULE_DRAFT));
    for (const template of SCHEDULE_TEMPLATES) {
      for (const key of Object.keys(template.draft)) {
        expect(known, `${template.id} sets unknown draft key "${key}"`).toContain(key);
      }
    }
  });

  it('never leaves a recurring template on the one-shot default', () => {
    for (const template of SCHEDULE_TEMPLATES) {
      // A "weekly review" that inherits recurrence 'once' runs a single time
      // and looks broken to whoever set it up.
      expect(template.draft.recurrence, template.id).toBeDefined();
      expect(template.draft.recurrence, template.id).not.toBe('once');
    }
  });

  it('gives every template a prompt and a name to submit with', () => {
    for (const template of SCHEDULE_TEMPLATES) {
      expect(template.draft.prompt?.trim(), template.id).toBeTruthy();
      expect(template.draft.name?.trim(), template.id).toBeTruthy();
    }
  });

  it('picks real weekdays for anything weekly', () => {
    for (const template of SCHEDULE_TEMPLATES) {
      if (template.draft.recurrence !== 'weekly') continue;
      expect(template.draft.daysOfWeek?.length, template.id).toBeGreaterThan(0);
      for (const day of template.draft.daysOfWeek ?? []) {
        expect(day).toBeGreaterThanOrEqual(0);
        expect(day).toBeLessThanOrEqual(6);
      }
    }
  });

  it('describes its cadence on the card in words, not cron', () => {
    for (const template of SCHEDULE_TEMPLATES) {
      expect(template.cadenceLabel, template.id).toBeTruthy();
      expect(template.cadenceLabel, template.id).not.toMatch(/[*/]/);
    }
  });

  it('marks the one template that needs the user to fill something in', () => {
    const monitor = SCHEDULE_TEMPLATES.find((t) => t.id === 'monitor-topic');
    // Shipping "Track [topic]" unmarked would create a schedule that runs
    // forever against a placeholder.
    expect(monitor?.draft.prompt).toMatch(/\[.+\]/);
  });
});
