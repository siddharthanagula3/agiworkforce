import { describe, expect, it } from 'vitest';
import { classifyAssistantFence } from '../assistantFence';

describe('classifyAssistantFence map', () => {
  it('keeps the coordinates a stop declared and null for a stop without them', () => {
    const fence = classifyAssistantFence(
      'map',
      'Chicago | 41.88, -87.63 | Start\nIndianapolis | Middle\nLouisville | 38.25,-85.76',
    );
    expect(fence.kind).toBe('map');
    if (fence.kind !== 'map') return;
    expect(fence.stops).toEqual([
      { name: 'Chicago', note: 'Start', lat: 41.88, lon: -87.63 },
      { name: 'Indianapolis', note: 'Middle', lat: null, lon: null },
      { name: 'Louisville', note: '', lat: 38.25, lon: -85.76 },
    ]);
  });

  it('treats a coordinate outside the globe as part of the note', () => {
    const fence = classifyAssistantFence('map', 'Nowhere | 95, 10 | Far');
    expect(fence.kind === 'map' && fence.stops[0]).toEqual({
      name: 'Nowhere',
      note: '95, 10 | Far',
      lat: null,
      lon: null,
    });
  });
});
