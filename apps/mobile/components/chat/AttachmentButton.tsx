import { useCallback } from 'react';
import { Pressable, ActionSheetIOS, Platform, Alert } from 'react-native';
import { Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Attachment } from './AttachmentPreview';

/**
 * Plus button that opens an action sheet to attach images or files.
 * Uses expo-image-picker for camera and photo library.
 * Returns selected media via the onAttach callback.
 */

interface AttachmentButtonProps {
  /** Called with new attachment(s) when user selects media */
  onAttach: (attachments: Attachment[]) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
}

/** Generate a simple unique ID */
function generateId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Extract filename from URI */
function getFileName(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] ?? 'file';
}

/** Map expo-image-picker asset to our Attachment type */
function assetToAttachment(asset: ImagePicker.ImagePickerAsset): Attachment {
  const mimeType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
  return {
    id: generateId(),
    uri: asset.uri,
    mimeType,
    fileName: asset.fileName ?? getFileName(asset.uri),
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
  };
}

async function requestCameraPermission(): Promise<boolean> {
  const { status: existing } = await ImagePicker.getCameraPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status: existing } = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

export function AttachmentButton({ onAttach, disabled = false }: AttachmentButtonProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const openCamera = useCallback(async () => {
    const permitted = await requestCameraPermission();
    if (!permitted) {
      Alert.alert(
        'Camera Access',
        'Camera permission is required to take photos. Please enable it in Settings.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      exif: false,
    });

    if (!result.canceled && result.assets.length > 0) {
      const attachments = result.assets.map(assetToAttachment);
      onAttach(attachments);
    }
  }, [onAttach]);

  const openPhotoLibrary = useCallback(async () => {
    const permitted = await requestMediaLibraryPermission();
    if (!permitted) {
      Alert.alert(
        'Photo Library Access',
        'Photo library permission is required. Please enable it in Settings.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      orderedSelection: true,
      exif: false,
    });

    if (!result.canceled && result.assets.length > 0) {
      const attachments = result.assets.map(assetToAttachment);
      onAttach(attachments);
    }
  }, [onAttach]);

  const showActionSheet = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Photo Library'],
          cancelButtonIndex: 0,
          title: 'Add Attachment',
        },
        (buttonIndex) => {
          switch (buttonIndex) {
            case 1:
              openCamera();
              break;
            case 2:
              openPhotoLibrary();
              break;
          }
        },
      );
    } else {
      // Android: use Alert as a simple action sheet
      Alert.alert('Add Attachment', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: openCamera },
        { text: 'Photo Library', onPress: openPhotoLibrary },
      ]);
    }
  }, [hapticsEnabled, openCamera, openPhotoLibrary]);

  return (
    <Pressable
      onPress={showActionSheet}
      disabled={disabled}
      className="p-1.5 rounded-lg active:bg-white/5"
      style={disabled ? { opacity: 0.5 } : undefined}
      accessibilityLabel="Add attachment"
      accessibilityHint="Opens options to take a photo or choose from library"
      accessibilityRole="button"
    >
      <Plus size={20} color={colors.textMuted} />
    </Pressable>
  );
}
