import { api } from '@/services/api';
import type { ProjectRecord } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';

function isProjectRecord(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.ownerUserId === 'string' &&
    typeof record.name === 'string' &&
    typeof record.defaultPrivacyMode === 'string' &&
    typeof record.defaultProviderMode === 'string' &&
    Array.isArray(record.allowedSurfaces)
  );
}

export async function fetchProject(id: string): Promise<ProjectRecord> {
  if (!FEATURES.auth || !FEATURES.crossDeviceSync) {
    throw new Error('projects: cloud project sync is not available on mobile');
  }
  const data = await api.get<{ project: unknown }>(`/api/projects/${id}`);
  if (!isProjectRecord(data.project)) {
    throw new Error('projects: malformed project response');
  }
  return data.project;
}
