import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { listCloudAgentRuns, type CloudAgentRunList } from '@/lib/services/cloud-agent-run-service';

type CloudAgentRunListInput = Parameters<typeof listCloudAgentRuns>[1];

export interface CloudAgentRunSearchInput extends CloudAgentRunListInput {
  text: string;
}

export function searchCloudAgentRuns(
  db: DatabaseAdapter,
  input: CloudAgentRunSearchInput,
): Promise<CloudAgentRunList> {
  return listCloudAgentRuns(db, input);
}
