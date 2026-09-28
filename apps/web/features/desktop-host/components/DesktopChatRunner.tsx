'use client';

import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { useComputerUseResume } from '../hooks/use-computer-use-resume';
import { useDispatchTaskRunner } from '../hooks/use-dispatch-task-runner';

export function DesktopChatRunner({ host }: { host: HostBridge }) {
  const runtime = useChatStream({ followActiveConversation: false });
  useDispatchTaskRunner(host, runtime);
  useComputerUseResume(host, runtime);
  return null;
}
