import { COMPANY_SITE_NAME } from '@agiworkforce/types';
import { Alert, Linking } from 'react-native';

const PHOTOS_PERMISSION_ERROR_NAME = 'PhotosPermissionError';
const PHOTOS_ACCESS_TITLE = 'Allow Photos access';
const PHOTOS_ACCESS_MESSAGE = `Allow ${COMPANY_SITE_NAME} to add photos in Settings to save images.`;

export function isPhotosPermissionDenied(error: unknown): error is Error {
  return error instanceof Error && error.name === PHOTOS_PERMISSION_ERROR_NAME;
}

export function showPhotosPermissionAlert(): void {
  Alert.alert(PHOTOS_ACCESS_TITLE, PHOTOS_ACCESS_MESSAGE, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open Settings',
      onPress: () => {
        void Linking.openSettings().catch(() => {
          Alert.alert('Settings unavailable', 'Open your device Settings to allow adding photos.');
        });
      },
    },
  ]);
}
