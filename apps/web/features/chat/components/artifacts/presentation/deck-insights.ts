export interface KpiTile {
  label: string;
  value: string;
  note: string;
}

export const MAX_KPI_TILES = 4;
export const MAX_INSIGHTS = 6;
export const INSIGHTS_TITLE = 'Key insights';

const BULLET = /^\s*(?:[-*•]\s+)/;

export function parseKpiTiles(source: string): KpiTile[] {
  const tiles: KpiTile[] = [];
  for (const line of source.split('\n')) {
    const [label = '', value = '', ...note] = line.split('|').map((part) => part.trim());
    if (label && value) tiles.push({ label, value, note: note.join(' | ') });
  }
  return tiles.slice(0, MAX_KPI_TILES);
}

export function parseInsights(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.replace(BULLET, '').trim())
    .filter(Boolean)
    .slice(0, MAX_INSIGHTS);
}
