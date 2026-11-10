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

export interface OwnedProjectCatalog {
  set(owner: ManagedCloudOwner | null, projects: readonly ActiveProjectSelection[]): void;
  read(owner: ManagedCloudOwner | null): readonly ActiveProjectSelection[];
  clear(): void;
}

export function createOwnedProjectCatalog(): OwnedProjectCatalog {
  let catalogOwner: ManagedCloudOwner | null = null;
  let projects: readonly ActiveProjectSelection[] = [];
  return {
    set(owner, next) {
      catalogOwner = owner ? { ...owner } : null;
      projects = catalogOwner ? next : [];
    },
    read(owner) {
      return sameManagedCloudOwner(catalogOwner, owner) ? projects : [];
    },
    clear() {
      catalogOwner = null;
      projects = [];
    },
  };
}
