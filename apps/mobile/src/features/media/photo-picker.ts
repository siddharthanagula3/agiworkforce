import * as ImagePicker from 'expo-image-picker';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import {
  SAFE_IMAGE_PICKER_OPTIONS,
  imageFileNameFor,
  imageMimeTypeFor,
} from '@/src/features/media/image-normalization';
import { withoutPictureMetadata } from '@/src/features/media/image-metadata';

type PickedCallback = {
  onPicked?: (count: number) => void;
};

type PickImageAssetsOptions = PickedCallback & {
  allowsMultipleSelection?: boolean;
  orderedSelection?: boolean;
  selectionLimit?: number;
};

function cleanedPickerResult(
  result: ImagePicker.ImagePickerResult,
  onPicked: PickedCallback['onPicked'],
): Promise<ImagePicker.ImagePickerAsset[]> {
  if (result.canceled || result.assets.length === 0) return Promise.resolve([]);
  onPicked?.(result.assets.length);
  return Promise.all(result.assets.map(withoutPictureMetadata));
}

export async function pickImageAssetsFromLibrary({
  allowsMultipleSelection = false,
  orderedSelection = false,
  selectionLimit,
  onPicked,
}: PickImageAssetsOptions = {}): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    ...SAFE_IMAGE_PICKER_OPTIONS,
    mediaTypes: ['images'],
    allowsMultipleSelection,
    selectionLimit,
    orderedSelection,
  });
  return cleanedPickerResult(result, onPicked);
}

export async function captureImageAssetsFromCamera({ onPicked }: PickedCallback = {}): Promise<
  ImagePicker.ImagePickerAsset[]
> {
  const result = await ImagePicker.launchCameraAsync({
    ...SAFE_IMAGE_PICKER_OPTIONS,
    mediaTypes: ['images'],
    allowsEditing: false,
  });
  return cleanedPickerResult(result, onPicked);
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
    ...(asset.assetId ? { pickerAssetId: asset.assetId } : {}),
  }));
}
