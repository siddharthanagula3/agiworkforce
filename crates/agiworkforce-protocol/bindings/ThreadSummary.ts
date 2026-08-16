import type { DeveloperSessionSource } from './DeveloperSessionSource';
import type { DeveloperSessionTrustMode } from './DeveloperSessionTrustMode';
import type { ThreadStatus } from './ThreadStatus';

export type ThreadSummary = {
  id: string;
  title: string;
  model?: string;
  cwd?: string;
  provider?: string;
  trustMode: DeveloperSessionTrustMode;
  createdAt: string;
  updatedAt: string;
  createdBy: DeveloperSessionSource;
  status: ThreadStatus;
};
