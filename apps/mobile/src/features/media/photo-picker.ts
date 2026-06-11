import * as ImagePicker from 'expo-image-picker';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

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
    mediaTypes: ['images'],
    quality: 0.85,
    allowsMultipleSelection,
    selectionLimit,
    orderedSelection,
    exif: false,
  });

  if (result.canceled) return [];
  return result.assets;
}

export function imageAssetsToChatAttachments(
  assets: ImagePicker.ImagePickerAsset[],
  prefix = 'photo',
): Attachment[] {
  const createdAt = Date.now();
  return assets.map((asset, index) => ({
    id: `${prefix}-${createdAt}-${index}`,
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileName: asset.fileName ?? 'image.jpg',
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
  }));
}
