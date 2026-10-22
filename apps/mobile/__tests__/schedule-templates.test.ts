import { MANAGED_CLOUD_SCHEDULE_TEMPLATES } from '@agiworkforce/cloud-contracts';
import { SCHEDULE_TEMPLATES, getScheduleTemplate } from '../src/features/schedules/templates';
import { isMobileScheduleRecurrenceSupported } from '../src/features/schedules/policy';
import { DEFAULT_AUTO_MODE_ID } from '../lib/models';

describe('Mobile schedule templates', () => {
  it('is the canonical managed-cloud template set, in order, with nothing added or dropped', () => {
    expect(SCHEDULE_TEMPLATES.map((template) => template.id)).toEqual(
      MANAGED_CLOUD_SCHEDULE_TEMPLATES.map((template) => template.id),
    );
    expect(SCHEDULE_TEMPLATES.map((template) => template.title)).toEqual(
      MANAGED_CLOUD_SCHEDULE_TEMPLATES.map((template) => template.name),
    );
    expect(SCHEDULE_TEMPLATES.map((template) => template.description)).toEqual(
      MANAGED_CLOUD_SCHEDULE_TEMPLATES.map((template) => template.description),
    );
  });

  it('maps each canonical draft onto the Mobile create draft', () => {
    for (const canonical of MANAGED_CLOUD_SCHEDULE_TEMPLATES) {
      const template = getScheduleTemplate(canonical.id);
      expect(template?.initialData).toEqual({
        name: canonical.draft.name,
        prompt: canonical.draft.prompt,
        model: DEFAULT_AUTO_MODE_ID,
        recurrence: canonical.draft.recurrence,
        timeOfDay: canonical.draft.timeOfDay,
        ...(canonical.draft.daysOfWeek ? { daysOfWeek: canonical.draft.daysOfWeek } : {}),
      });
    }
  });

  it('contains only cadences the Mobile schedule form can deliver', () => {
    expect(SCHEDULE_TEMPLATES.length).toBeGreaterThan(0);

    for (const template of SCHEDULE_TEMPLATES) {
      expect(isMobileScheduleRecurrenceSupported(template.initialData.recurrence)).toBe(true);
      expect(template.initialData.name.trim()).not.toBe('');
      expect(template.initialData.prompt.trim()).not.toBe('');
    }
  });

  it('gives every template an emoji and a unique id', () => {
    expect(new Set(SCHEDULE_TEMPLATES.map((template) => template.id)).size).toBe(
      SCHEDULE_TEMPLATES.length,
    );
    for (const template of SCHEDULE_TEMPLATES) {
      expect(template.emoji.trim()).not.toBe('');
    }
  });

  it('resolves only known scalar IDs', () => {
    expect(getScheduleTemplate('daily-briefing')?.title).toBe('Daily briefing');
    expect(getScheduleTemplate('daily-focus')).toBeUndefined();
    expect(getScheduleTemplate('not-a-template')).toBeUndefined();
    expect(getScheduleTemplate(['daily-briefing'])).toBeUndefined();
    expect(getScheduleTemplate(undefined)).toBeUndefined();
  });
});
