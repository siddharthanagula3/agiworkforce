import { COMPANY_SITE_NAME } from '@agiworkforce/types';
import { Alert, Linking } from 'react-native';

import {
  isPhotosPermissionDenied,
  showPhotosPermissionAlert,
} from '@/src/features/image/photosAccess';

describe('photosAccess', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the fixed message and never an error message', () => {
    showPhotosPermissionAlert();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Allow Photos access');
    expect(message).toBe(`Allow ${COMPANY_SITE_NAME} to add photos in Settings to save images.`);
    expect(buttons.map((button: { text: string }) => button.text)).toEqual([
      'Cancel',
      'Open Settings',
    ]);
  });

  it('opens Settings from the second button and explains when that fails', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('no'));
    showPhotosPermissionAlert();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];

    buttons[1].onPress?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Settings unavailable',
      'Open your device Settings to allow adding photos.',
    );
  });

  it('recognises only the named permission error', () => {
    const denied = new Error('x');
    denied.name = 'PhotosPermissionError';
    expect(isPhotosPermissionDenied(denied)).toBe(true);
    expect(isPhotosPermissionDenied(new Error('x'))).toBe(false);
    expect(isPhotosPermissionDenied('PhotosPermissionError')).toBe(false);
  });
});
