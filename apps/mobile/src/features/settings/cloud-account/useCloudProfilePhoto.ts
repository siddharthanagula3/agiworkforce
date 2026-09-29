import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { IMAGE_ATTACHMENT_MIME_TYPES, MAX_AVATAR_BYTES } from '@agiworkforce/types';
import { api } from '@/services/api';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useCloudProfileStore } from './cloudProfileStore';

interface CloudPhotoUser {
  id: string;
  setProfileImage: (input: { file: string }) => Promise<{ publicUrl: string | null }>;
}

export function useCloudProfilePhoto(clerkUser: CloudPhotoUser | null | undefined) {
  const [savingPhoto, setSavingPhoto] = useState(false);

  const changePhoto = useCallback(async () => {
    if (!clerkUser || savingPhoto) return;
    const account = captureCloudAccountEpoch();
    if (!account || account.ownerId !== clerkUser.id) {
      Alert.alert('Account changed', 'Open this account again before changing its photo.');
      return;
    }
    setSavingPhoto(true);
    let imageUploaded = false;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.85,
        base64: true,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        Alert.alert('Photo unavailable', 'That image could not be read. Pick another photo.');
        return;
      }
      const mimeType = asset.mimeType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
      if (!IMAGE_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
        Alert.alert('Unsupported photo', 'Pick a PNG, JPEG, GIF, WebP, or HEIC image.');
        return;
      }
      const decodedBytes =
        Math.floor((asset.base64.length * 3) / 4) -
        (asset.base64.endsWith('==') ? 2 : asset.base64.endsWith('=') ? 1 : 0);
      if (
        (typeof asset.fileSize === 'number' && asset.fileSize > MAX_AVATAR_BYTES) ||
        decodedBytes > MAX_AVATAR_BYTES
      ) {
        Alert.alert(
          'Photo too large',
          `Pick an image under ${MAX_AVATAR_BYTES / (1024 * 1024)} MB.`,
        );
        return;
      }
      if (!isCloudAccountEpochCurrent(account)) return;
      const image = await clerkUser.setProfileImage({
        file: `data:${mimeType};base64,${asset.base64}`,
      });
      imageUploaded = true;
      if (!isCloudAccountEpochCurrent(account)) {
        Alert.alert(
          'Account changed',
          'The photo changed on the previous account. It was not applied to the current account.',
        );
        return;
      }
      if (!image.publicUrl || new URL(image.publicUrl).protocol !== 'https:') {
        throw new Error('Profile image URL unavailable');
      }
      await api.patch('/api/me', { avatar_url: image.publicUrl });
      if (isCloudAccountEpochCurrent(account)) {
        useCloudProfileStore.getState().setAvatar(account.ownerId, image.publicUrl);
      }
    } catch {
      Alert.alert(
        imageUploaded ? 'Photo may not have synced' : 'Could not update photo',
        imageUploaded
          ? 'The account photo could not be synced across devices. Check your connection and try again.'
          : 'Your profile photo was not changed. Check your connection and try again.',
      );
    } finally {
      setSavingPhoto(false);
    }
  }, [clerkUser, savingPhoto]);

  return { changePhoto, savingPhoto };
}
