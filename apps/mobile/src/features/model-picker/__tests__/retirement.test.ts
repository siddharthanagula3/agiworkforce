import { readFileSync } from 'fs';
import { join } from 'path';
import { getRetiredModelMetadataById } from '@agiworkforce/types';
import {
  retiredModelNotice,
  upcomingRetirementLabel,
} from '@/src/features/model-picker/retirement';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-19T12:00:00.000Z');

describe('model retirement on mobile', () => {
  it('warns in the month before a model retires and not before or after', () => {
    const inTwoWeeks = new Date(NOW + 14 * DAY_MS).toISOString();
    expect(upcomingRetirementLabel({ deprecation_date: inTwoWeeks }, NOW)).toMatch(/^Retires /);
    expect(
      upcomingRetirementLabel({ deprecation_date: new Date(NOW + 60 * DAY_MS).toISOString() }, NOW),
    ).toBeNull();
    expect(
      upcomingRetirementLabel({ deprecation_date: new Date(NOW - DAY_MS).toISOString() }, NOW),
    ).toBeNull();
    expect(upcomingRetirementLabel(undefined, NOW)).toBeNull();
  });

  it('tells a chat whose model was retired what to do next', () => {
    const registry = JSON.parse(
      readFileSync(
        join(__dirname, '../../../../../../packages/ai/model-registry/catalog/retired-models.json'),
        'utf8',
      ),
    ) as { retiredModels: Array<{ id: string }> };
    const retiredId = registry.retiredModels
      .map((record) => record.id)
      .find((id) => getRetiredModelMetadataById(id) !== null);
    expect(retiredId).toBeDefined();
    const name = getRetiredModelMetadataById(retiredId)!.name;

    expect(retiredModelNotice(retiredId)).toContain(
      `${name}, which this chat used, has been retired.`,
    );
    expect(retiredModelNotice(undefined)).toBeNull();
  });
});
