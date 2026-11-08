import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

export interface ActiveProjectSelection {
  id: string;
  name: string;
}

export function readStoredActiveProject(
  value: unknown,
  owner: ManagedCloudOwner,
): ActiveProjectSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  if (!sameManagedCloudOwner(normalizeManagedCloudOwner(stored['owner']), owner)) return null;
  const project = stored['project'];
  if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
  const record = project as Record<string, unknown>;
  const id = record['id'];
  const name = record['name'];
  return typeof id === 'string' && id && typeof name === 'string' && name ? { id, name } : null;
}
