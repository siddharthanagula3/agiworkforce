import { describe, expect, it } from 'vitest';

import { AGI_COMMANDS, parseAgiCommand } from '../commands.js';

describe('parseAgiCommand', () => {
  it('defaults bare /agi to help', () => {
    expect(parseAgiCommand('/agi')).toEqual({ ok: true, command: 'help' });
    expect(parseAgiCommand('  /agi  ')).toEqual({ ok: true, command: 'help' });
  });

  it('parses every simple command', () => {
    for (const command of AGI_COMMANDS) {
      if (command === 'suppress' || command === 'unsuppress' || command === 'fix') continue;
      expect(parseAgiCommand(`/agi ${command}`)).toEqual({ ok: true, command });
    }
  });

  it('parses suppress with finding id and reason', () => {
    const parsed = parseAgiCommand(
      '/agi suppress 123e4567-e89b-42d3-a456-426614174000 --reason "known issue, tracked in #42"',
    );
    expect(parsed).toEqual({
      ok: true,
      command: 'suppress',
      findingId: '123e4567-e89b-42d3-a456-426614174000',
      reason: 'known issue, tracked in #42',
    });
  });

  it('rejects suppress without a reason or with a bad finding id', () => {
    expect(parseAgiCommand('/agi suppress 123e4567-e89b-42d3-a456-426614174000').ok).toBe(false);
    expect(parseAgiCommand('/agi suppress $(rm -rf /) --reason "x"').ok).toBe(false);
  });

  it('parses unsuppress and fix with a finding id', () => {
    expect(parseAgiCommand('/agi unsuppress abcd1234')).toEqual({
      ok: true,
      command: 'unsuppress',
      findingId: 'abcd1234',
    });
    expect(parseAgiCommand('/agi fix abcd1234')).toEqual({
      ok: true,
      command: 'fix',
      findingId: 'abcd1234',
    });
  });

  it('rejects unknown commands and injection attempts, bounding the echo', () => {
    const parsed = parseAgiCommand('/agi deploy-production --now');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.length).toBeLessThan(80);
    expect(parseAgiCommand('/agi; rm -rf /').ok).toBe(false);
    expect(parseAgiCommand('random text').ok).toBe(false);
  });
});
