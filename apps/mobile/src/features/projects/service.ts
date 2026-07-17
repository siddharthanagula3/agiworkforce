import type { ProjectRecord } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { managedCloudProjects } from '@/services/managedCloudProjects';

export async function fetchProject(id: string): Promise<ProjectRecord> {
  if (!FEATURES.auth || !FEATURES.crossDeviceSync) {
    throw new Error('projects: cloud project sync is not available on mobile');
  }
  return managedCloudProjects.getProject(id);
}
