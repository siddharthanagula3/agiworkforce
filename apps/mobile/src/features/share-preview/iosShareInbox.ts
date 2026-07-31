import {
  AppState,
  NativeModules,
  Platform,
  type AppStateStatus,
  type NativeEventSubscription,
} from 'react-native';

export interface IOSPendingShare {
  text: string;
  truncated: boolean;
  count: number;
}

interface AGIShareInboxModule {
  consumePendingShares(): Promise<IOSPendingShare | null>;
}

function getShareInboxModule(): AGIShareInboxModule {
  const module = NativeModules.AGIShareInbox as AGIShareInboxModule | undefined;
  if (!module?.consumePendingShares) {
    throw new Error('AGIShareInbox native module not linked — rebuild the iOS app');
  }
  return module;
}

export async function consumeIOSPendingShares(): Promise<IOSPendingShare | null> {
  if (Platform.OS !== 'ios') return null;
  const pending = await getShareInboxModule().consumePendingShares();
  if (!pending || typeof pending.text !== 'string' || !pending.text.trim()) return null;
  return {
    text: pending.text,
    truncated: pending.truncated === true,
    count: Number.isFinite(pending.count) && pending.count > 0 ? pending.count : 1,
  };
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
