import {
  AppState,
  NativeModules,
  Platform,
  type AppStateStatus,
  type NativeEventSubscription,
} from 'react-native';

export interface IOSPendingShareFile {
  uri: string;
  fileName: string;
  mimeType: string;
  byteSize?: number;
}

export interface IOSPendingShare {
  text: string;
  truncated: boolean;
  count: number;
  files: IOSPendingShareFile[];
}

interface AGIShareInboxModule {
  consumePendingShares(): Promise<unknown>;
}

function getShareInboxModule(): AGIShareInboxModule {
  const module = NativeModules.AGIShareInbox as AGIShareInboxModule | undefined;
  if (!module?.consumePendingShares) {
    throw new Error('AGIShareInbox native module not linked, rebuild the iOS app');
  }
  return module;
}

function normalizeFile(raw: unknown): IOSPendingShareFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw as Record<string, unknown>;
  const uri = typeof file.uri === 'string' ? file.uri.trim() : '';
  const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : '';
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType.trim() : '';
  if (!uri.startsWith('file://') || !fileName) return null;
  const byteSize =
    typeof file.byteSize === 'number' && file.byteSize > 0 ? file.byteSize : undefined;
  return {
    uri,
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    ...(byteSize ? { byteSize } : {}),
  };
}

export function normalizePendingShare(raw: unknown): IOSPendingShare | null {
  if (!raw || typeof raw !== 'object') return null;
  const pending = raw as Record<string, unknown>;
  const text = typeof pending.text === 'string' ? pending.text : '';
  const files = Array.isArray(pending.files)
    ? pending.files.map(normalizeFile).filter((file): file is IOSPendingShareFile => file !== null)
    : [];
  if (!text.trim() && files.length === 0) return null;
  const count = typeof pending.count === 'number' && pending.count > 0 ? pending.count : 1;
  return {
    text,
    truncated: pending.truncated === true,
    count,
    files,
  };
}

export async function consumeIOSPendingShares(): Promise<IOSPendingShare | null> {
  if (Platform.OS !== 'ios') return null;
  return normalizePendingShare(await getShareInboxModule().consumePendingShares());
}

export function subscribeToIOSShareInbox(
  onShare: (share: IOSPendingShare) => void,
  onError: (error: unknown) => void,
): () => void {
  if (Platform.OS !== 'ios') return () => undefined;

  let disposed = false;
  let consuming = false;
  const consume = async () => {
    if (disposed || consuming) return;
    consuming = true;
    try {
      const pending = await consumeIOSPendingShares();
      if (pending && !disposed) onShare(pending);
    } catch (error) {
      if (!disposed) onError(error);
    } finally {
      consuming = false;
    }
  };

  void consume();
  const subscription: NativeEventSubscription = AppState.addEventListener(
    'change',
    (state: AppStateStatus) => {
      if (state === 'active') void consume();
    },
  );

  return () => {
    disposed = true;
    subscription.remove();
  };
}
