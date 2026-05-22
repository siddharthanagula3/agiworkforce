import { api } from '@/services/api';
import type { ProjectRecord } from '@agiworkforce/types';

export async function fetchProject(id: string): Promise<ProjectRecord> {
  const data = await api.get<{ project: ProjectRecord }>(`/api/projects/${id}`);
  return data.project;
}
