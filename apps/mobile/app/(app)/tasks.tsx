import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { CloudTasksScreen, useCloudTaskStore } from '@/src/features/tasks';

export default function TasksRoute() {
  const params = useLocalSearchParams<{ runId?: string | string[] }>();
  const runId = Array.isArray(params.runId) ? params.runId[0] : params.runId;
  const cloudReady = useChatAppModeStore((state) => state.appMode === 'cloud');
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const openRun = useCloudTaskStore((state) => state.openRun);

  useEffect(() => {
    if (!runId || !cloudReady || !cloudUnlocked) return;
    router.setParams({ runId: undefined });
    void openRun(runId);
  }, [cloudReady, cloudUnlocked, openRun, runId]);

  return <CloudTasksScreen />;
}
