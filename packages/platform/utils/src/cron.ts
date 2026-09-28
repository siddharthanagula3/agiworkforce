const MAX_CRON_LENGTH = 256;

type CronFieldName = 'minute' | 'hour' | 'day of month' | 'month' | 'day of week';

export interface CronField {
  readonly values: ReadonlySet<number>;
  readonly sorted: readonly number[];
  readonly wildcard: boolean;
}

export interface ParsedCronExpression {
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dayOfMonth: CronField;
  readonly month: CronField;
  readonly dayOfWeek: CronField;
}

function parseCronField(
  source: string,
  name: CronFieldName,
  min: number,
  max: number,
  normalize: (value: number) => number = (value) => value,
): CronField {
  const wildcard = source === '*';
  const values = new Set<number>();
  const segments = source.split(',');
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error(`Invalid ${name} field`);
  }

  for (const segment of segments) {
    const stepParts = segment.split('/');
    if (stepParts.length > 2) throw new Error(`Invalid ${name} step`);
    const [base = '', stepText] = stepParts;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step <= 0 || step > max - min + 1) {
      throw new Error(`Invalid ${name} step`);
    }

    let start: number;
    let end: number;
    if (base === '*') {
      start = min;
      end = max;
    } else if (/^\d+$/.test(base)) {
      start = Number(base);
      end = stepText === undefined ? start : max;
    } else {
      const match = /^(\d+)-(\d+)$/.exec(base);
      if (!match) throw new Error(`Invalid ${name} field`);
      start = Number(match[1]);
      end = Number(match[2]);
    }

    if (start < min || end > max || start > end) {
      throw new Error(`${name} must be between ${min} and ${max}`);
    }
    for (let value = start; value <= end; value += step) values.add(normalize(value));
  }

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error(`Invalid ${name} field`);
  return { values, sorted, wildcard };
}

function maxDaysInMonth(month: number): number {
  if (month === 2) return 29;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseCronExpression(expression: string): ParsedCronExpression {
  if (expression.length > MAX_CRON_LENGTH) throw new Error('Cron expression is too long');
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron expression must contain exactly five fields');

  const parsed: ParsedCronExpression = {
    minute: parseCronField(fields[0]!, 'minute', 0, 59),
    hour: parseCronField(fields[1]!, 'hour', 0, 23),
    dayOfMonth: parseCronField(fields[2]!, 'day of month', 1, 31),
    month: parseCronField(fields[3]!, 'month', 1, 12),
    dayOfWeek: parseCronField(fields[4]!, 'day of week', 0, 7, (value) =>
      value === 7 ? 0 : value,
    ),
  };

  if (!parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) {
    const canOccur = parsed.month.sorted.some((month) =>
      parsed.dayOfMonth.sorted.some((day) => day <= maxDaysInMonth(month)),
    );
    if (!canOccur) throw new Error('Cron expression can never occur');
  }

  return parsed;
}

const CRON_DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatCronClockTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatCronDayList(days: readonly number[]): string {
  const labels = days.map((day) => CRON_DAY_LABELS[day]!);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * Renders a cron expression the way the product form's own presets read
 * ("Weekly on Monday at 9:00 AM"), for the shapes `buildCronExpression`
 * itself produces: one minute, one hour, and a wildcard month. Anything
 * outside that, a step, a range, multiple hours, a restricted month, falls
 * back to the raw expression rather than describing it wrong.
 */
export function describeCronCadence(expression: string): string {
  let cron: ParsedCronExpression;
  try {
    cron = parseCronExpression(expression);
  } catch {
    return expression;
  }

  if (cron.minute.sorted.length !== 1 || cron.hour.sorted.length !== 1 || !cron.month.wildcard) {
    return expression;
  }

  const time = formatCronClockTime(cron.hour.sorted[0]!, cron.minute.sorted[0]!);

  if (cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard) {
    return `Daily at ${time}`;
  }
  if (cron.dayOfMonth.wildcard && cron.dayOfWeek.sorted.length === 7) {
    return `Daily at ${time}`;
  }
  if (cron.dayOfMonth.wildcard) {
    return `Weekly on ${formatCronDayList(cron.dayOfWeek.sorted)} at ${time}`;
  }
  if (cron.dayOfWeek.wildcard && cron.dayOfMonth.sorted.length === 1) {
    return `Monthly on day ${cron.dayOfMonth.sorted[0]} at ${time}`;
  }
  return expression;
}
