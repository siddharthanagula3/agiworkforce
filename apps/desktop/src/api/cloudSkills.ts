import { CLOUD_API_BASE_URL } from './cloudApi';
import { createManagedCloudRequestContext } from '../services/managedCloudRequestContext';
import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSummary as CloudSkillEntry,
} from '@agiworkforce/cloud-contracts';

export type { CloudSkillEntry };

export async function listCloudSkills(): Promise<CloudSkillEntry[]> {
  const request = createManagedCloudRequestContext('Cloud skill catalog');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/skills`, {
    method: 'GET',
    headers: await request.getHeaders(),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to list Cloud skills: HTTP ${response.status}`);
  }
  const payload: unknown = await response.json();
  request.assertBoundary();
  const parsed = ManagedSkillsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('The Cloud skill catalog returned an invalid response.');
  }
  return parsed.data.skills;
}
