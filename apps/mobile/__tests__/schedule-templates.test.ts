import { SCHEDULE_TEMPLATES, getScheduleTemplate } from '../src/features/schedules/templates';
import { isMobileScheduleRecurrenceSupported } from '../src/features/schedules/policy';

describe('Mobile schedule templates', () => {
  it('contains only cadences the Mobile schedule form can deliver', () => {
    expect(SCHEDULE_TEMPLATES.length).toBeGreaterThan(0);

    for (const template of SCHEDULE_TEMPLATES) {
      expect(isMobileScheduleRecurrenceSupported(template.initialData.recurrence)).toBe(true);
      expect(template.initialData.name.trim()).not.toBe('');
      expect(template.initialData.prompt.trim()).not.toBe('');
    }
  });

  it('resolves only known scalar IDs', () => {
    expect(getScheduleTemplate('daily-focus')?.title).toBe('Daily focus');
    expect(getScheduleTemplate('not-a-template')).toBeUndefined();
    expect(getScheduleTemplate(['daily-focus'])).toBeUndefined();
    expect(getScheduleTemplate(undefined)).toBeUndefined();
  });
});
