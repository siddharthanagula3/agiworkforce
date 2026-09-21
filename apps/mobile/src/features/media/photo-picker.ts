import * as ImagePicker from 'expo-image-picker';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import {
  SAFE_IMAGE_PICKER_OPTIONS,
  imageFileNameFor,
  imageMimeTypeFor,
} from '@/src/features/media/image-normalization';
import { withoutPictureMetadata } from '@/src/features/media/image-metadata';

type PickImageAssetsOptions = {
  allowsMultipleSelection?: boolean;
  orderedSelection?: boolean;
  selectionLimit?: number;
};

export async function pickImageAssetsFromLibrary({
  allowsMultipleSelection = false,
  orderedSelection = false,
  selectionLimit,
}: PickImageAssetsOptions = {}): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    ...SAFE_IMAGE_PICKER_OPTIONS,
    mediaTypes: ['images'],
    allowsMultipleSelection,
    selectionLimit,
    orderedSelection,
  });

  if (result.canceled) return [];
  return Promise.all(result.assets.map(withoutPictureMetadata));
}

export async function captureImageAssetsFromCamera(): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchCameraAsync({
    ...SAFE_IMAGE_PICKER_OPTIONS,
    mediaTypes: ['images'],
    allowsEditing: false,
  });

  if (result.canceled) return [];
  return Promise.all(result.assets.map(withoutPictureMetadata));
}

export function imageAssetsToChatAttachments(
  assets: ImagePicker.ImagePickerAsset[],
  prefix = 'photo',
): Attachment[] {
  const createdAt = Date.now();
  return assets.map((asset, index) => ({
    id: `${prefix}-${createdAt}-${index}`,
    uri: asset.uri,
    mimeType: imageMimeTypeFor(asset),
    fileName: imageFileNameFor(asset, `${prefix}-${createdAt}-${index}`),
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
  }));
}
