interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function parseDateAndTime(date: string, time: string): WallClockParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(`${date}T${time}`);
  if (!match) throw new Error('Enter a valid date and time.');

  const parts: WallClockParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const normalized = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() + 1 !== parts.month ||
    normalized.getUTCDate() !== parts.day
  ) {
    throw new Error('Enter a valid date and time.');
  }
  return parts;
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new Error('Enter a valid IANA timezone, such as America/Chicago.');
  }
}

function partsAt(formatter: Intl.DateTimeFormat, instant: Date): WallClockParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

function sameWallClock(left: WallClockParts, right: WallClockParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export function zonedDateAndTimeToIso(date: string, time: string, timezone: string): string {
  const target = parseDateAndTime(date, time);
  const formatter = formatterFor(timezone);
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsets = new Set<number>();

  for (let hours = -48; hours <= 48; hours += 6) {
    const sampleMs = naiveUtc + hours * 60 * 60_000;
    const sample = new Date(sampleMs);
    const local = partsAt(formatter, sample);
    offsets.add(
      Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - sampleMs,
    );
  }

  const candidates = [...offsets]
    .map((offset) => new Date(naiveUtc - offset))
    .filter((candidate) => sameWallClock(partsAt(formatter, candidate), target))
    .map((candidate) => candidate.toISOString())
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .sort();

  if (candidates.length === 0) {
    throw new Error(
      'This local time does not exist because the clock changes for daylight saving.',
    );
  }
  if (candidates.length > 1) {
    throw new Error('This local time occurs twice because the clock changes for daylight saving.');
  }
  return candidates[0]!;
}

export function isoToZonedDateInput(value: string | null | undefined, timezone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = partsAt(formatterFor(timezone), date);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}
