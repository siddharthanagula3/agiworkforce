import { SHARED_TEXT_TRUNCATED_NOTICE, sanitiseSharedText } from '@/src/features/share-preview';

function stated(notice: string): number {
  const match = /truncated to (\d+) KB before/.exec(notice);
  if (!match?.[1]) throw new Error(`No KB size in: ${notice}`);
  return Number(match[1]) * 1024;
}

describe('the size the share preview states', () => {
  it('uses KB, never the binary unit name', () => {
    expect(SHARED_TEXT_TRUNCATED_NOTICE).toBe('Content was truncated to 100 KB before sending.');
    expect(SHARED_TEXT_TRUNCATED_NOTICE).not.toMatch(/KiB|MiB/);
  });

  it('is the size it truncates shared text at, in the unit people see in their files app', () => {
    const limit = stated(SHARED_TEXT_TRUNCATED_NOTICE);

    expect(sanitiseSharedText('a'.repeat(limit)).truncated).toBe(false);
    expect(sanitiseSharedText('a'.repeat(limit + 1)).truncated).toBe(true);
  });
});
