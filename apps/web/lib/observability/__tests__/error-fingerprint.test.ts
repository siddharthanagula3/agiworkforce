import { describe, expect, it } from 'vitest';

import { errorFingerprint } from '../error-capture';

function errorWithStack(name: string, message: string, frames: readonly string[]): Error {
  const error = new Error(message);
  error.name = name;
  error.stack = [`${name}: ${message}`, ...frames].join('\n');
  return error;
}

const FRAMES_A = [
  '    at resolveEntitlement (/var/task/apps/web/lib/services/entitlement-resolution.ts:184:11)',
  '    at async handlePost (/var/task/apps/web/app/api/upgrade/route.ts:52:3)',
];

describe('a recurring exception has one identity', () => {
  it('gives two occurrences at the same site the same fingerprint', () => {
    const first = errorWithStack('TypeError', 'Cannot read properties of undefined', FRAMES_A);
    const second = errorWithStack('TypeError', 'Cannot read properties of undefined', FRAMES_A);

    expect(errorFingerprint(first)).toBe(errorFingerprint(second));
  });

  // The message carries the id of whatever the request was about, so an error
  // that is the same fault every time would otherwise be a new group each time.
  it('ignores the part of the message that differs per occurrence', () => {
    const first = errorWithStack('AppError', 'conversation conv_8812 not found', FRAMES_A);
    const second = errorWithStack('AppError', 'conversation conv_4417 not found', FRAMES_A);

    expect(errorFingerprint(first)).toBe(errorFingerprint(second));
  });

  it('survives a release that moved the line and rebuilt the chunk', () => {
    const before = errorWithStack('TypeError', 'boom', [
      '    at render (webpack-internal:///./apps/web/features/chat/Transcript.tsx:210:9)',
      '    at mount (/var/task/.next/server/chunks/apps/web/lib/render.9f2a11c4.js:14:2)',
    ]);
    const after = errorWithStack('TypeError', 'boom', [
      '    at render (webpack-internal:///./apps/web/features/chat/Transcript.tsx:243:9)',
      '    at mount (/srv/.next/server/chunks/apps/web/lib/render.2b77de90.js:19:6)',
    ]);

    expect(errorFingerprint(before)).toBe(errorFingerprint(after));
  });

  it('tells two different faults apart', () => {
    const one = errorWithStack('TypeError', 'boom', FRAMES_A);
    const other = errorWithStack('TypeError', 'boom', [
      '    at settleUsage (/var/task/apps/web/lib/services/usage-settlement.ts:64:5)',
      '    at async drain (/var/task/apps/web/lib/jobs/job-drain.ts:180:7)',
    ]);
    const renamed = errorWithStack('RangeError', 'boom', FRAMES_A);

    expect(errorFingerprint(one)).not.toBe(errorFingerprint(other));
    expect(errorFingerprint(one)).not.toBe(errorFingerprint(renamed));
  });

  it('answers for a thrown value that is not an error at all', () => {
    expect(errorFingerprint('a string')).toBe('string|unknown');
    expect(errorFingerprint(new Error('no stack at all'))).toContain('Error|');
  });
});
