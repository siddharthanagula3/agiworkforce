import { CLOUD_API_BASE_URL } from './cloudApi';
import { createManagedCloudRequestContext } from '../services/managedCloudRequestContext';

export interface CloudSkillEntry {
  name: string;
  description: string;
  source: string;
}

function parseCloudSkill(value: unknown): CloudSkillEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record['name'] !== 'string' || typeof record['source'] !== 'string') {
    return null;
  }
  return {
    name: record['name'],
    description: typeof record['description'] === 'string' ? record['description'] : '',
    source: record['source'],
  };
}

/** List the authenticated Managed Cloud skill catalog used by chat admission. */
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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('The Cloud skill catalog returned an invalid response.');
  }
  const skills = (payload as Record<string, unknown>)['skills'];
  if (!Array.isArray(skills)) {
    throw new Error('The Cloud skill catalog did not include a skill list.');
  }
  return skills.map(parseCloudSkill).filter((skill): skill is CloudSkillEntry => skill !== null);
}
