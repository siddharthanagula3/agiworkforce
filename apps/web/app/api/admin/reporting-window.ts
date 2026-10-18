const DEFAULT_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function readReportingWindow(
  params: URLSearchParams,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = parseDate(params.get('to'), now);
  const from = parseDate(
    params.get('from'),
    new Date(to.getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY),
  );
  return { from, to };
}
