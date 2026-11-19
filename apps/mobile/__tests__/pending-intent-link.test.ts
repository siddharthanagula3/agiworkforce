import {
  clearPendingIntentLink,
  consumePendingIntentLink,
  stagePendingIntentLink,
} from '../src/features/auth/services/postAuthIntent';

describe('pending intent link', () => {
  afterEach(() => clearPendingIntentLink());

  it('hands the staged link over once', () => {
    stagePendingIntentLink('agiworkforce://intent/chat');

    expect(consumePendingIntentLink()).toBe('agiworkforce://intent/chat');
    expect(consumePendingIntentLink()).toBeNull();
  });

  it('keeps only the latest staged link', () => {
    stagePendingIntentLink('agiworkforce://intent/chat');
    stagePendingIntentLink('agiworkforce://intent/camera');

    expect(consumePendingIntentLink()).toBe('agiworkforce://intent/camera');
  });

  it('forgets a link that was cleared', () => {
    stagePendingIntentLink('agiworkforce://intent/chat');
    clearPendingIntentLink();

    expect(consumePendingIntentLink()).toBeNull();
  });

  it('is not carried into a fresh app process', () => {
    stagePendingIntentLink('agiworkforce://intent/chat');

    jest.isolateModules(() => {
      const restarted = jest.requireActual<
        typeof import('../src/features/auth/services/postAuthIntent')
      >('../src/features/auth/services/postAuthIntent');
      expect(restarted.consumePendingIntentLink()).toBeNull();
    });
  });
});
