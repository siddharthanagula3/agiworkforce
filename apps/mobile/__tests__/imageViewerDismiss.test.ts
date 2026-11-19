import {
  canDismissAtScale,
  DISMISS_DISTANCE_RATIO,
  DISMISS_MIN_TRAVEL,
  DISMISS_VELOCITY,
  dismissBackdropOpacity,
  dismissPictureScale,
  dismissProgress,
  dragDownOffset,
  shouldDismissViewer,
} from '../src/features/chat/components/imageViewerDismiss';

const EXTENT = 1000;

describe('canDismissAtScale', () => {
  it('allows a picture at 1x and refuses any zoomed picture', () => {
    expect(canDismissAtScale(1)).toBe(true);
    expect(canDismissAtScale(1.5)).toBe(false);
    expect(canDismissAtScale(5)).toBe(false);
  });
});

describe('dragDownOffset', () => {
  it('follows a downward drag and holds at zero for an upward one', () => {
    expect(dragDownOffset(120)).toBe(120);
    expect(dragDownOffset(-120)).toBe(0);
  });
});

describe('shouldDismissViewer', () => {
  it('closes past the distance with no speed', () => {
    expect(shouldDismissViewer(EXTENT * DISMISS_DISTANCE_RATIO, 0, EXTENT)).toBe(true);
  });

  it('keeps the viewer open short of the distance and slow', () => {
    expect(
      shouldDismissViewer(EXTENT * DISMISS_DISTANCE_RATIO - 1, DISMISS_VELOCITY - 1, EXTENT),
    ).toBe(false);
  });

  it('closes on speed alone once the finger has travelled the minimum', () => {
    expect(shouldDismissViewer(DISMISS_MIN_TRAVEL + 1, DISMISS_VELOCITY, EXTENT)).toBe(true);
  });

  it('never closes on a touch that barely moved or moved upward', () => {
    expect(shouldDismissViewer(DISMISS_MIN_TRAVEL, DISMISS_VELOCITY * 5, EXTENT)).toBe(false);
    expect(shouldDismissViewer(-400, DISMISS_VELOCITY * 5, EXTENT)).toBe(false);
  });
});

describe('dismiss progress', () => {
  it('runs from none to full and stays inside that range', () => {
    expect(dismissProgress(0, EXTENT)).toBe(0);
    expect(dismissProgress(EXTENT, EXTENT)).toBe(1);
    expect(dismissProgress(-50, EXTENT)).toBe(0);
    expect(dismissProgress(10, 0)).toBe(0);
  });

  it('dims the backdrop and shrinks the picture as it goes', () => {
    expect(dismissBackdropOpacity(0)).toBe(1);
    expect(dismissBackdropOpacity(1)).toBeLessThan(1);
    expect(dismissBackdropOpacity(1)).toBeGreaterThan(0);
    expect(dismissPictureScale(0)).toBe(1);
    expect(dismissPictureScale(1)).toBeLessThan(1);
  });
});
