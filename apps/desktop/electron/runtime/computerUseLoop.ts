/**
 * A model driving the screen can repeat itself: the same click on a control
 * that never answers, or two steps alternating forever. Nothing on the machine
 * notices, so the pointer keeps moving with no way out but quitting the app.
 * This watches the shape of the steps, not their meaning. A refused step stays
 * in the history, so repeating it again is refused again. A step of a different
 * shape clears it, and so does a screenshot that shows the screen moved: five
 * scrolls down a long page are progress, five clicks on a dead button are not.
 */

export const COMPUTER_USE_REPEAT_LIMIT = 5;
export const COMPUTER_USE_CYCLE_LIMIT = 4;
const HISTORY = COMPUTER_USE_CYCLE_LIMIT * 2;

export type ComputerUseLoopVerdict = 'ok' | 'repeat' | 'cycle';

export interface ComputerUseLoopDetector {
  observe: (signature: string) => ComputerUseLoopVerdict;
  reset: () => void;
}

/**
 * The shape of one step. Coordinates are rounded into a small grid so a click
 * that lands a pixel away each time is still the same click.
 */
export function stepSignature(command: string, args: Record<string, unknown>): string {
  const parts = [command];
  for (const key of ['x', 'y', 'toX', 'toY', 'deltaX', 'deltaY', 'count']) {
    const value = args[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      parts.push(`${key}=${Math.round(value / 8)}`);
    }
  }
  for (const key of ['text', 'key', 'button']) {
    const value = args[key];
    if (typeof value === 'string') parts.push(`${key}=${value.slice(0, 64)}`);
  }
  return parts.join(' ');
}

export function createComputerUseLoopDetector(
  repeatLimit = COMPUTER_USE_REPEAT_LIMIT,
  cycleLimit = COMPUTER_USE_CYCLE_LIMIT,
): ComputerUseLoopDetector {
  let history: string[] = [];

  function repeated(): boolean {
    if (history.length < repeatLimit) return false;
    const tail = history.slice(-repeatLimit);
    return tail.every((entry) => entry === tail[0]);
  }

  function cycling(): boolean {
    if (history.length < cycleLimit * 2) return false;
    const tail = history.slice(-cycleLimit * 2);
    const first = tail.slice(0, cycleLimit);
    const second = tail.slice(cycleLimit);
    if (first.every((entry) => entry === first[0])) return false;
    return first.every((entry, index) => entry === second[index]);
  }

  return {
    observe(signature: string): ComputerUseLoopVerdict {
      history.push(signature);
      if (history.length > HISTORY) history = history.slice(-HISTORY);
      if (repeated()) return 'repeat';
      if (cycling()) return 'cycle';
      return 'ok';
    },
    reset() {
      history = [];
    },
  };
}

/** Width a screenshot is shrunk to before two of them are compared. */
export const FRAME_SAMPLE_WIDTH = 48;
const LUMA_LEVELS_SHIFT = 4;
const CHANGED_CELL_SHARE = 0.02;

/** A BGRA bitmap as one coarse brightness value per pixel. */
export function frameLuma(bitmap: Uint8Array): Uint8Array {
  const cells = new Uint8Array(Math.floor(bitmap.length / 4));
  for (let cell = 0; cell < cells.length; cell += 1) {
    const offset = cell * 4;
    const blue = bitmap[offset] ?? 0;
    const green = bitmap[offset + 1] ?? 0;
    const red = bitmap[offset + 2] ?? 0;
    cells[cell] = ((red * 3 + green * 6 + blue) / 10) >> LUMA_LEVELS_SHIFT;
  }
  return cells;
}

/**
 * Whether the screen moved between two screenshots. A clock tick or a blinking
 * caret changes a handful of cells, which is not the screen answering a step.
 */
export function frameDiffers(previous: Uint8Array | null, next: Uint8Array): boolean {
  if (!previous || previous.length !== next.length) return true;
  let changed = 0;
  for (let cell = 0; cell < next.length; cell += 1) {
    if (previous[cell] !== next[cell]) changed += 1;
  }
  return changed > next.length * CHANGED_CELL_SHARE;
}

export function computerUseLoopMessage(verdict: Exclude<ComputerUseLoopVerdict, 'ok'>): string {
  return verdict === 'repeat'
    ? 'That same screen step has run several times in a row and no screenshot since has shown the screen changing, so it has been stopped. Take a fresh screenshot, and if the screen still looks the same, tell the user what is not responding instead of trying again.'
    : 'The last few screen steps have been repeating in a circle and no screenshot since has shown the screen changing, so they have been stopped. Take a fresh screenshot and describe what you see to the user before trying anything else.';
}
