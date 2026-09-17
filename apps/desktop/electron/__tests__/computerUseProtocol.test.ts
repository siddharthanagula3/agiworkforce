import { describe, expect, it } from 'vitest';
import {
  chooseCaptureDisplay,
  describeDisplays,
  frameHelperLines,
  readHelperReply,
} from '../runtime/computerUseProtocol';

describe('frameHelperLines', () => {
  it('keeps a reply split across two stdout chunks intact', () => {
    const first = frameHelperLines('{"id":1,"ok":tr');
    expect(first.lines).toEqual([]);
    const second = frameHelperLines(`${first.rest}ue}\n`);
    expect(second.lines).toEqual(['{"id":1,"ok":true}']);
    expect(second.rest).toBe('');
  });

  it('splits several replies delivered in one chunk, in order', () => {
    const framed = frameHelperLines('{"ok":true}\n{"ok":false,"error":"no"}\n{"ok":tr');
    expect(framed.lines).toEqual(['{"ok":true}', '{"ok":false,"error":"no"}']);
    expect(framed.rest).toBe('{"ok":tr');
  });

  it('drops blank lines rather than pairing one with a waiting step', () => {
    expect(frameHelperLines('\n\n{"ok":true}\n').lines).toEqual(['{"ok":true}']);
  });
});

describe('readHelperReply', () => {
  it('reads a success and a failure', () => {
    expect(readHelperReply('{"id":3,"ok":true}')).toEqual({ ok: true });
    expect(readHelperReply('{"ok":false,"error":"Accessibility is off."}')).toEqual({
      ok: false,
      error: 'Accessibility is off.',
    });
  });

  it('treats anything it cannot read as a failure, never as a success', () => {
    for (const line of ['not json', '[]', 'null', '{"ok":"true"}', '{}']) {
      expect(readHelperReply(line).ok).toBe(false);
    }
  });

  it('supplies a message when the helper reports a failure without one', () => {
    const reply = readHelperReply('{"ok":false}');
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error.length).toBeGreaterThan(0);
  });
});

describe('choosing the display a screenshot captures', () => {
  const main = {
    id: 1,
    label: 'Built-in Retina Display',
    size: { width: 1512, height: 982 },
    scaleFactor: 2,
  };
  const external = {
    id: 5,
    label: 'LG UltraFine',
    size: { width: 2560, height: 1440 },
    scaleFactor: 1,
  };
  const displays = [main, external];

  it('takes the display the step asked for', () => {
    expect(
      chooseCaptureDisplay(displays, { requestedId: 5, rememberedId: 1, fallback: main }),
    ).toBe(external);
  });

  it('refuses a display that is not connected rather than guessing another', () => {
    expect(chooseCaptureDisplay(displays, { requestedId: 9, fallback: main })).toEqual({
      unknownDisplay: 9,
    });
  });

  it('stays on the remembered display, and falls back when it was unplugged', () => {
    expect(chooseCaptureDisplay(displays, { rememberedId: 5, fallback: main })).toBe(external);
    expect(chooseCaptureDisplay(displays, { rememberedId: 3, fallback: main })).toBe(main);
  });

  it('describes every display with its own scale factor and marks the primary', () => {
    expect(describeDisplays(displays, 1)).toEqual([
      {
        id: 1,
        name: 'Built-in Retina Display',
        width: 1512,
        height: 982,
        scaleFactor: 2,
        primary: true,
      },
      { id: 5, name: 'LG UltraFine', width: 2560, height: 1440, scaleFactor: 1, primary: false },
    ]);
  });
});
