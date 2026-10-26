import { thinkingDurationSecondsOf } from '@/src/features/chat/utils/thinkingDuration';

describe('thinking duration metadata', () => {
  it('reads the duration a web turn stores, so a synced chat shows how long it thought', () => {
    expect(thinkingDurationSecondsOf({ thinkingDurationSeconds: 4.2 })).toBe(4.2);
  });

  it('still reads a duration stored on this device before the shared name', () => {
    expect(thinkingDurationSecondsOf({ thinkingDuration: 3 })).toBe(3);
  });

  it('ignores anything that is not a finite number', () => {
    expect(thinkingDurationSecondsOf({ thinkingDurationSeconds: 'soon' })).toBeUndefined();
    expect(thinkingDurationSecondsOf(undefined)).toBeUndefined();
  });
});
