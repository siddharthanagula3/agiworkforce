import { describe, expect, it } from 'vitest';
import { getUsageUrgency } from '../usage-vocabulary';

describe('getUsageUrgency', () => {
  it.each([
    [0, 'info'],
    [89.9, 'info'],
    [90, 'warning'],
    [94.9, 'warning'],
    [95, 'critical'],
    [100, 'critical'],
  ])('maps %s%% to %s', (percent, level) => {
    expect(getUsageUrgency(percent)).toBe(level);
  });
});
