'use client';

import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useDispatchTaskRunner } from '../hooks/use-dispatch-task-runner';

export function DispatchTaskRunner({ host }: { host: HostBridge }) {
  useDispatchTaskRunner(host);
  return null;
}
