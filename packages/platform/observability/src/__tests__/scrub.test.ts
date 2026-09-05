import { describe, expect, it } from 'vitest';
import { scrubErrorPayload } from '../scrub';

describe('scrubErrorPayload', () => {
  it('drops the error message entirely', () => {
    const error = new Error('user@example.com leaked a secret in /Users/alice/notes.txt');
    const result = scrubErrorPayload(error);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('notes.txt');
    expect(result.name).toBe('Error');
  });

  it('keeps only function names from the stack, dropping file paths and urls', () => {
    const error = new Error('boom');
    error.stack = [
      'Error: boom',
      '    at handleClick (https://app.example.com/assets/app.js:42:17)',
      '    at HTMLButtonElement.<anonymous> (/Users/alice/project/src/index.ts:9:3)',
      '    at Object.run (native)',
    ].join('\n');

    const result = scrubErrorPayload(error);

    expect(result.frames).toEqual([
      { functionName: 'handleClick' },
      { functionName: 'HTMLButtonElement.<anonymous>' },
      { functionName: 'Object.run' },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('.ts:9:3');
  });

  it('falls back to a generic name and an anonymous frame label', () => {
    const error = new Error('boom');
    error.name = '';
    error.stack = 'Error: boom\n    at file:///opt/app/dist/index.js:1:1';

    const result = scrubErrorPayload(error);

    expect(result.name).toBe('Error');
    expect(result.frames).toEqual([{ functionName: '<anonymous>' }]);
  });

  it('returns no frames when the error carries no stack', () => {
    const error = new Error('boom');
    error.stack = undefined;

    const result = scrubErrorPayload(error);

    expect(result.frames).toEqual([]);
  });
});
