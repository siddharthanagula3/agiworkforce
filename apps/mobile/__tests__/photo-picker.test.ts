import * as ImagePicker from 'expo-image-picker';
import {
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '../src/features/media/photo-picker';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

const mockLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockRequestMediaLibraryPermissionsAsync =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;

describe('photoPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the system image picker without requesting broad photo-library access first', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });

    await expect(pickImageAssetsFromLibrary()).resolves.toEqual([]);

    expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: false,
      selectionLimit: undefined,
      orderedSelection: false,
      exif: false,
    });
  });

  it('maps selected image assets into chat attachments', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1710000000000);

    expect(
      imageAssetsToChatAttachments([
        {
          uri: 'file:///selected-photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'selected-photo.jpg',
          width: 1200,
          height: 900,
          fileSize: 2048,
        },
      ]),
    ).toEqual([
      {
        id: 'photo-1710000000000-0',
        uri: 'file:///selected-photo.jpg',
        mimeType: 'image/jpeg',
        fileName: 'selected-photo.jpg',
        width: 1200,
        height: 900,
        fileSize: 2048,
      },
    ]);
  });
});
