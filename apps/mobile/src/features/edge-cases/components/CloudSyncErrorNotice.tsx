import { useEffect, useRef } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { syncNow } from '@/services/cloudSyncEngine';
import { showToast } from '@/src/shared/components/Toast';

export const CLOUD_SYNC_FAILED_MESSAGE = 'Cloud changes haven’t synced.';

export function CloudSyncErrorNotice(): null {
  const { isOnline } = useNetworkStatus();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const status = useCloudSyncStateStore((state) => state.status);
  const lastError = useCloudSyncStateStore((state) => state.lastError);
  const announcedError = useRef<string | null>(null);

  const errorKey = lastError ?? 'Cloud sync failed';
  const failing = isOnline && isSignedIn && appMode === 'cloud' && status === 'error';

  useEffect(() => {
    if (status === 'idle') announcedError.current = null;
  }, [status]);

  useEffect(() => {
    if (!failing || announcedError.current === errorKey) return;
    announcedError.current = errorKey;
    showToast(CLOUD_SYNC_FAILED_MESSAGE, { label: 'Retry', onPress: () => void syncNow() });
  }, [errorKey, failing]);

  return null;
}
