import { describe, expect, it } from 'vitest';
import { MAX_KPI_TILES, parseInsights, parseKpiTiles } from './deck-insights';
import { slideSegments } from './deck-model';

describe('kpi and insights blocks', () => {
  it('reads label, value and note per line and keeps at most four tiles', () => {
    const tiles = parseKpiTiles(
      ['Approval | 57.3% | strong', 'Bad line', 'A | 1', 'B | 2', 'C | 3', 'D | 4'].join('\n'),
    );
    expect(tiles).toHaveLength(MAX_KPI_TILES);
    expect(tiles[0]).toEqual({ label: 'Approval', value: '57.3%', note: 'strong' });
    expect(tiles[1]).toEqual({ label: 'A', value: '1', note: '' });
  });

  it('strips bullet markers and blank lines from insights', () => {
    expect(parseInsights('- one\n\n* two\n• three\nfour')).toEqual(['one', 'two', 'three', 'four']);
  });

  it('splits both fences out of a slide as their own segments', () => {
    const slide = '## Analysis\n\n```kpi\nA | 1\n```\n\n```insights\n- x\n```';
    expect(slideSegments(slide).map((segment) => segment.kind)).toEqual([
      'markdown',
      'kpi',
      'insights',
    ]);
  });
});
