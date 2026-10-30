export function executionChartsToPersist(pngs: readonly string[]): string[] {
  return [...new Set(pngs.filter((png) => png.length > 0))];
}
