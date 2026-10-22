import {
  cacheDirectory,
  deleteAsync,
  EncodingType,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';

import { exportMobileDiagnostics, type DiagnosticEvent } from './diagnosticsBundle';

const DIAGNOSTICS_DIR = `${cacheDirectory}diagnostics/`;

const CONSENT_TITLE = 'Share diagnostics?';
const CONSENT_BODY =
  'Sends app, device and error details to AGI Workforce, never your messages, files or passwords.';

export function confirmMobileDiagnosticsShare(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      CONSENT_TITLE,
      CONSENT_BODY,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function shareMobileDiagnostics(
  input: {
    recentEvents?: readonly DiagnosticEvent[];
    conversationId?: string | null;
    screen?: string | null;
  } = {},
): Promise<string> {
  const result = await exportMobileDiagnostics(input);
  const target = `${DIAGNOSTICS_DIR}${result.filename}`;

  let wroteTemporaryFile = false;
  try {
    const info = await getInfoAsync(DIAGNOSTICS_DIR);
    if (!info.exists) await makeDirectoryAsync(DIAGNOSTICS_DIR, { intermediates: true });

    await writeAsStringAsync(target, JSON.stringify(result.diagnostics, null, 2), {
      encoding: EncodingType.UTF8,
    });
    wroteTemporaryFile = true;

    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device.');
    }
    await Sharing.shareAsync(target, {
      mimeType: 'application/json',
      dialogTitle: 'Share your AGI diagnostics',
      UTI: 'public.json',
    });
    return result.summary;
  } finally {
    if (wroteTemporaryFile) await deleteAsync(target, { idempotent: true }).catch(() => {});
  }
}
