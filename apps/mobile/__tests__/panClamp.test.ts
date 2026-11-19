import { clampPanOffset } from '@/src/features/image/panClamp';

describe('clampPanOffset', () => {
  it('does not move an image that still fits on the stage when zoomed', () => {
    expect(clampPanOffset(40, 1.2, 200, 400)).toBe(0);
    expect(clampPanOffset(-40, 1, 400, 400)).toBe(0);
  });

  it('stops at the point where the zoomed edge meets the stage edge', () => {
    expect(clampPanOffset(1000, 2, 400, 400)).toBe(100);
    expect(clampPanOffset(-1000, 2, 400, 400)).toBe(-100);
  });

  it('leaves an offset inside the limit alone', () => {
    expect(clampPanOffset(37, 2, 400, 400)).toBe(37);
  });
});
