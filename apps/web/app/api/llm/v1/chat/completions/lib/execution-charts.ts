/** One code run can emit an intermediate figure and then the finished chart.
 * Persisting every figure showed the clipped attempt above the real one.
 */
export function executionChartsToPersist(pngs: readonly string[]): string[] {
  const present = pngs.filter((png) => png.length > 0);
  if (present.length <= 1) return [...present];
  const unique: string[] = [];
  for (const png of present) {
    if (!unique.includes(png)) unique.push(png);
  }
  const last = unique[unique.length - 1];
  return last ? [last] : [];
}
