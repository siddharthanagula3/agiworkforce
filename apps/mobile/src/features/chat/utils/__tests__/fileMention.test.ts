import { trailingMention, withoutTrailingMention } from '@/src/features/chat/utils/fileMention';

describe('file mentions in the composer', () => {
  it('reads the @ word being typed at the end of the text', () => {
    expect(trailingMention('Summarise @rep')).toBe('rep');
    expect(trailingMention('@')).toBe('');
    expect(trailingMention('mail me at a@b.com')).toBeNull();
    expect(trailingMention('no mention here')).toBeNull();
    expect(trailingMention('@report then more')).toBeNull();
  });

  it('drops the @ word once a file is chosen', () => {
    expect(withoutTrailingMention('Summarise @rep')).toBe('Summarise ');
  });
});
