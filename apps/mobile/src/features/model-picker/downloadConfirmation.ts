import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import { CELLULAR_CONSENT_SETTING_PATH } from '@/services/modelDownload';

interface DownloadCandidate {
  name: string;
  fileSizeBytes?: number;
}

async function isOnMobileData(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return (
      state.type === 'cellular' ||
      (state.details as { isConnectionExpensive?: boolean } | null)?.isConnectionExpensive === true
    );
  } catch {
    return false;
  }
}

function sizeOf(model: DownloadCandidate): string | null {
  return model.fileSizeBytes && model.fileSizeBytes > 0
    ? formatAttachmentSize(model.fileSizeBytes)
    : null;
}

export async function confirmModelDownload(
  model: DownloadCandidate,
  allowCellularDownloads: boolean,
): Promise<boolean> {
  const size = sizeOf(model);
  const onMobileData = await isOnMobileData();

  if (onMobileData && !allowCellularDownloads) {
    Alert.alert(
      'Wi-Fi needed',
      `${model.name}${size ? ` is ${size}, and` : ' is a large download, and'} your device is on mobile data. Connect to Wi-Fi, or turn on ${CELLULAR_CONSENT_SETTING_PATH} to use mobile data.`,
      [{ text: 'OK', style: 'cancel' }],
    );
    return false;
  }

  const storage = size
    ? `It is ${size}. It starts downloading now and uses that much storage on this device.`
    : 'It starts downloading now and uses storage on this device.';
  const data = onMobileData ? ' Your device is on mobile data, so this download will use it.' : '';

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      `Download ${model.name}?`,
      `${storage}${data}`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Download', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
