import { DEFAULT_AUTO_MODE_ID } from '@/lib/models';
import { scheduleDraftFromPrompt } from '@/src/features/schedules/templates';

describe('scheduleDraftFromPrompt', () => {
  it('names the task after the first line and keeps the whole prompt and model', () => {
    const draft = scheduleDraftFromPrompt(
      '  Summarise overnight sales\nGroup by region and flag drops over 10%.  ',
      'model-from-chat',
    );
    expect(draft).toEqual({
      name: 'Summarise overnight sales',
      prompt: 'Summarise overnight sales\nGroup by region and flag drops over 10%.',
      model: 'model-from-chat',
      recurrence: 'daily',
      timeOfDay: '09:00',
    });
  });

  it('shortens a long first line and falls back to Auto without a model', () => {
    const draft = scheduleDraftFromPrompt('x'.repeat(200), undefined);
    expect(draft.name).toHaveLength(60);
    expect(draft.name.endsWith('…')).toBe(true);
    expect(draft.model).toBe(DEFAULT_AUTO_MODE_ID);
  });
});
