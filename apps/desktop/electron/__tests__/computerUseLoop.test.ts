import { describe, expect, it } from 'vitest';
import {
  COMPUTER_USE_REPEAT_LIMIT,
  computerUseLoopMessage,
  createComputerUseLoopDetector,
  frameDiffers,
  frameLuma,
  stepSignature,
} from '../runtime/computerUseLoop';

function observeAll(signatures: readonly string[]): string[] {
  const detector = createComputerUseLoopDetector();
  return signatures.map((signature) => detector.observe(signature));
}

describe('the shape a screen step is remembered by', () => {
  it('reads a click a few pixels away as the same click', () => {
    expect(stepSignature('computer_click', { x: 400, y: 300 })).toBe(
      stepSignature('computer_click', { x: 403, y: 302 }),
    );
  });

  it('reads a click somewhere else as a different one', () => {
    expect(stepSignature('computer_click', { x: 400, y: 300 })).not.toBe(
      stepSignature('computer_click', { x: 700, y: 300 }),
    );
  });

  it('tells two different keys apart', () => {
    expect(stepSignature('computer_key', { key: 'enter' })).not.toBe(
      stepSignature('computer_key', { key: 'escape' }),
    );
  });

  it('keeps nothing of a long paste beyond what tells it apart', () => {
    const signature = stepSignature('computer_type', { text: 'x'.repeat(5_000) });
    expect(signature.length).toBeLessThan(120);
  });

  it('ignores an argument that is not a number where one belongs', () => {
    expect(stepSignature('computer_click', { x: Number.NaN, y: 10 })).toBe(
      stepSignature('computer_click', { y: 10 }),
    );
  });
});

describe('noticing that a screen session is going nowhere', () => {
  it('lets a step through until it has run the same way too many times', () => {
    const verdicts = observeAll(Array.from({ length: COMPUTER_USE_REPEAT_LIMIT }, () => 'click 1'));
    expect(verdicts.slice(0, -1).every((verdict) => verdict === 'ok')).toBe(true);
    expect(verdicts.at(-1)).toBe('repeat');
  });

  it('keeps refusing while the caller keeps repeating it', () => {
    const detector = createComputerUseLoopDetector();
    for (let attempt = 0; attempt < COMPUTER_USE_REPEAT_LIMIT; attempt += 1) {
      detector.observe('click 1');
    }
    expect(detector.observe('click 1')).toBe('repeat');
    expect(detector.observe('click 1')).toBe('repeat');
  });

  it('notices two steps alternating forever, which no repeat count would catch', () => {
    const detector = createComputerUseLoopDetector();
    const verdicts: string[] = [];
    for (let round = 0; round < 5; round += 1) {
      verdicts.push(detector.observe('open menu'), detector.observe('close menu'));
    }
    expect(verdicts.includes('cycle')).toBe(true);
    expect(verdicts.includes('repeat')).toBe(false);
  });

  it('leaves real progress alone however long it goes on', () => {
    const verdicts = observeAll(Array.from({ length: 40 }, (_, index) => `click ${index}`));
    expect(verdicts.every((verdict) => verdict === 'ok')).toBe(true);
  });

  it('lets a caller out by doing something of another shape', () => {
    const detector = createComputerUseLoopDetector();
    for (let attempt = 0; attempt < COMPUTER_USE_REPEAT_LIMIT; attempt += 1) {
      detector.observe('click 1');
    }
    detector.observe('type hello');
    expect(detector.observe('click 1')).toBe('ok');
  });

  it('starts over when the session does', () => {
    const detector = createComputerUseLoopDetector();
    for (let attempt = 0; attempt < COMPUTER_USE_REPEAT_LIMIT; attempt += 1) {
      detector.observe('click 1');
    }
    detector.reset();
    expect(detector.observe('click 1')).toBe('ok');
  });
});

describe('what the caller is told when it is stopped', () => {
  it('tells it to look at the screen rather than to try harder', () => {
    expect(computerUseLoopMessage('repeat')).toContain('Take a fresh screenshot');
    expect(computerUseLoopMessage('cycle')).toContain('Take a fresh screenshot');
    expect(computerUseLoopMessage('repeat')).not.toBe(computerUseLoopMessage('cycle'));
  });
});

describe('telling a screen that moved from one that did not', () => {
  function frame(cells: number, paint: (cell: number) => number): Uint8Array {
    const bitmap = new Uint8Array(cells * 4);
    for (let cell = 0; cell < cells; cell += 1) {
      const value = paint(cell);
      bitmap.set([value, value, value, 255], cell * 4);
    }
    return frameLuma(bitmap);
  }

  it('reads the first screenshot as a change, because there is nothing to compare it with', () => {
    expect(
      frameDiffers(
        null,
        frame(1_000, () => 200),
      ),
    ).toBe(true);
  });

  it('does not read a clock tick or a blinking caret as the screen answering', () => {
    const before = frame(1_000, () => 200);
    const after = frame(1_000, (cell) => (cell < 10 ? 0 : 200));
    expect(frameDiffers(before, after)).toBe(false);
  });

  it('reads a page that scrolled as a change', () => {
    const before = frame(1_000, (cell) => (cell % 2 === 0 ? 0 : 255));
    const after = frame(1_000, (cell) => (cell % 2 === 0 ? 255 : 0));
    expect(frameDiffers(before, after)).toBe(true);
  });

  it('reads a different sized capture as a change rather than comparing across it', () => {
    expect(
      frameDiffers(
        frame(1_000, () => 200),
        frame(900, () => 200),
      ),
    ).toBe(true);
  });
});
