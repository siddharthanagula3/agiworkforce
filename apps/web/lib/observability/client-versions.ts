import { MINIMUM_SUPPORTED_RUNTIME_VERSION, isSupportedRuntimeVersion } from '@agiworkforce/types';

// A caller names its own version, so a pattern alone lets one request mint one
// series. These two windows are the closed set a version is checked against.
const RELEASE_SERIES = /^(\d{1,6})\.(\d{1,6})/u;

// The surfaces version two ways: the runtime line the version registry floors,
// and the calendar line the packaged apps ship. Both are admitted, nothing else.
const MAJORS_AHEAD = 1;
const MINORS_PER_MAJOR = 20;
const YEARS_EITHER_SIDE = 1;
const MONTHS_PER_YEAR = 12;

function floorSeries(): { major: number; minor: number } {
  const match = RELEASE_SERIES.exec(MINIMUM_SUPPORTED_RUNTIME_VERSION);
  return { major: Number(match?.[1] ?? 0), minor: Number(match?.[2] ?? 0) };
}

function runtimeSeries(): readonly string[] {
  const floor = floorSeries();
  const labels: string[] = [];
  for (let major = floor.major; major <= floor.major + MAJORS_AHEAD; major += 1) {
    const first = major === floor.major ? floor.minor : 0;
    for (let minor = first; minor < first + MINORS_PER_MAJOR; minor += 1) {
      labels.push(`${major}.${minor}`);
    }
  }
  return labels;
}

function calendarSeries(year: number): readonly string[] {
  const labels: string[] = [];
  for (let offset = -YEARS_EITHER_SIDE; offset <= YEARS_EITHER_SIDE; offset += 1) {
    for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
      labels.push(`${year + offset}.${month}`);
    }
  }
  return labels;
}

export function clientVersionLabels(now = new Date()): readonly string[] {
  return [...runtimeSeries(), ...calendarSeries(now.getUTCFullYear())];
}

export const CLIENT_VERSION_LABELS: readonly string[] = clientVersionLabels();

const KNOWN = new Set(CLIENT_VERSION_LABELS);

// Patch is dropped: it moves weekly and says least about a failure. A runtime
// series is additionally held to the floor the version registry declares.
export function clientVersionLabel(raw: string): string | undefined {
  const trimmed = raw.trim();
  const match = RELEASE_SERIES.exec(trimmed);
  if (match === null) return undefined;
  const major = Number(match[1]);
  const series = `${major}.${Number(match[2])}`;
  if (!KNOWN.has(series)) return undefined;
  const runtimeLine = major <= floorSeries().major + MAJORS_AHEAD;
  return runtimeLine && !isSupportedRuntimeVersion(trimmed) ? undefined : series;
}
