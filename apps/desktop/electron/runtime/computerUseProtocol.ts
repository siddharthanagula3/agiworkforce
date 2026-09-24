import type { DeviceScreenDisplay } from '@agiworkforce/local-runtime-contract';

/**
 * The line protocol between the main process and the macOS input helper.
 *
 * One JSON request per line out, one JSON reply per line back. Kept free of
 * Electron and of the child process so the framing can be tested directly: a
 * reply split across two stdout chunks, or a helper that dies mid-line, are the
 * cases that strand a step the turn is waiting on.
 */

export interface HelperFraming {
  lines: string[];
  rest: string;
}

export function frameHelperLines(buffered: string): HelperFraming {
  const lines: string[] = [];
  let rest = buffered;
  let newline = rest.indexOf('\n');
  while (newline >= 0) {
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    if (line.length > 0) lines.push(line);
    newline = rest.indexOf('\n');
  }
  return { lines, rest };
}

export type HelperReply = { ok: true } | { ok: false; error: string };

export function readHelperReply(line: string): HelperReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, error: 'The input helper sent an unreadable reply.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'The input helper sent an unreadable reply.' };
  }
  const record = parsed as { ok?: unknown; error?: unknown };
  if (record.ok === true) return { ok: true };
  return {
    ok: false,
    error:
      typeof record.error === 'string' && record.error.length > 0
        ? record.error
        : 'That action could not be carried out.',
  };
}

export interface DisplayCandidate {
  id: number;
  label: string;
  size: { width: number; height: number };
  scaleFactor: number;
}

/**
 * The size to ask a capture for. Electron reports a display in points, so a
 * thumbnail sized from those is half resolution on a Retina screen and the
 * model reads a blurred one.
 */
export function physicalCaptureSize(display: DisplayCandidate): {
  width: number;
  height: number;
} {
  const scale = display.scaleFactor > 0 ? display.scaleFactor : 1;
  return {
    width: Math.round(display.size.width * scale),
    height: Math.round(display.size.height * scale),
  };
}

export function chooseCaptureDisplay<T extends DisplayCandidate>(
  displays: readonly T[],
  options: { requestedId?: number; rememberedId?: number | null; fallback: T },
): T | { unknownDisplay: number } {
  if (options.requestedId !== undefined) {
    const requested = displays.find((display) => display.id === options.requestedId);
    return requested ?? { unknownDisplay: options.requestedId };
  }
  if (options.rememberedId !== undefined && options.rememberedId !== null) {
    const remembered = displays.find((display) => display.id === options.rememberedId);
    if (remembered) return remembered;
  }
  return options.fallback;
}

export function describeDisplays(
  displays: readonly DisplayCandidate[],
  primaryId: number,
): DeviceScreenDisplay[] {
  return displays.map((display, index) => ({
    id: display.id,
    name: display.label || (display.id === primaryId ? 'the main screen' : `screen ${index + 1}`),
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor,
    primary: display.id === primaryId,
  }));
}
