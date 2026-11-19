import { describe, expect, it } from 'vitest';
import { composerTextWithIncoming } from '../composerIncoming';

describe('composerTextWithIncoming', () => {
  it('fills an empty composer with the incoming text', () => {
    expect(composerTextWithIncoming('', 'Summarise this')).toBe('Summarise this');
    expect(composerTextWithIncoming('  \n', 'Summarise this')).toBe('Summarise this');
  });

  it('adds incoming text after an unsent draft instead of replacing it', () => {
    expect(composerTextWithIncoming('my draft\n', 'Summarise this')).toBe(
      'my draft\n\nSummarise this',
    );
  });

  it('keeps the draft when the incoming text is empty or already present', () => {
    expect(composerTextWithIncoming('my draft', '   ')).toBe('my draft');
    expect(composerTextWithIncoming('my draft\n\nSummarise this', 'Summarise this')).toBe(
      'my draft\n\nSummarise this',
    );
  });
});
