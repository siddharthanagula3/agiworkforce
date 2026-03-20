import { useCallback } from 'react';
import { Pressable, ActionSheetIOS, Platform, Alert } from 'react-native';
import { Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Attachment } from './AttachmentPreview';

/**
 * Plus button that opens an action sheet to attach images or files.
 * Uses expo-image-picker for camera and photo library.
 * Uses expo-document-picker for PDFs and documents.
 * Returns selected media via the onAttach callback.
 *
 * Edge case handling:
 *  - Files exceeding MAX_FILE_SIZE_BYTES are rejected with a clear alert.
 *  - Unsupported MIME types from the document picker are rejected.
 *  - All pickers validate results before invoking onAttach.
 */

/** 25 MB upload limit — matches the API gateway limit */
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Allowed MIME types for document picker */
const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
] as const;

type AllowedDocMime = (typeof ALLOWED_DOC_TYPES)[number];

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

/** Format bytes to a human-readable size string */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate file size. Shows an alert and returns false if the file is too large.
 * Returns true if the file is within limits.
 */
function validateFileSize(fileName: string, fileSize: number | undefined): boolean {
  if (fileSize !== undefined && fileSize > MAX_FILE_SIZE_BYTES) {
    Alert.alert(
      'File Too Large',
      `"${fileName}" is ${formatSize(fileSize)}, which exceeds the ${formatSize(MAX_FILE_SIZE_BYTES)} limit. Please choose a smaller file.`,
      [{ text: 'OK' }],
    );
    return false;
  }
  return true;
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
      // Filter out oversized images (rare but possible with RAW formats)
      const valid = result.assets.filter((a) => {
        const name = a.fileName ?? getFileName(a.uri);
        return validateFileSize(name, a.fileSize);
      });
      if (valid.length > 0) {
        onAttach(valid.map(assetToAttachment));
      }
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
      const valid = result.assets.filter((a) => {
        const name = a.fileName ?? getFileName(a.uri);
        return validateFileSize(name, a.fileSize);
      });
      if (valid.length > 0) {
        onAttach(valid.map(assetToAttachment));
      }
    }
  }, [onAttach]);

  const openDocumentPicker = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_DOC_TYPES],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const validAttachments: Attachment[] = [];

        for (const asset of result.assets) {
          const mimeType = asset.mimeType ?? 'application/octet-stream';
          const fileName = asset.name ?? getFileName(asset.uri);

          // Reject unsupported MIME types (document picker can return unexpected types)
          if (!ALLOWED_DOC_TYPES.includes(mimeType as AllowedDocMime)) {
            Alert.alert(
              'Unsupported File Type',
              `"${fileName}" is not a supported file type. Please attach a PDF, Word document, text file, or CSV.`,
              [{ text: 'OK' }],
            );
            continue;
          }

          // Reject oversized files
          if (!validateFileSize(fileName, asset.size)) {
            continue;
          }

          validAttachments.push({
            id: generateId(),
            uri: asset.uri,
            mimeType,
            fileName,
            fileSize: asset.size,
          });
        }

        if (validAttachments.length > 0) {
          onAttach(validAttachments);
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  }, [onAttach]);

  const showActionSheet = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Photo Library', 'Choose File'],
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
            case 3:
              openDocumentPicker();
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
        { text: 'Choose File', onPress: openDocumentPicker },
      ]);
    }
  }, [hapticsEnabled, openCamera, openPhotoLibrary, openDocumentPicker]);

  return (
    <Pressable
      onPress={showActionSheet}
      disabled={disabled}
      className="p-1.5 rounded-lg active:bg-white/5"
      style={disabled ? { opacity: 0.5 } : undefined}
      accessibilityLabel="Add attachment"
      accessibilityHint="Opens options to take a photo, choose from library, or pick a document"
      accessibilityRole="button"
    >
      <Plus size={20} color={colors.textMuted} />
    </Pressable>
  );
}
