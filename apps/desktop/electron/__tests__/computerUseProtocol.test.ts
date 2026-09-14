import { describe, expect, it } from 'vitest';
import { frameHelperLines, readHelperReply } from '../runtime/computerUseProtocol';

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
