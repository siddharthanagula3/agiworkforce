import type { CloudProject, CloudProjectDetails } from '@/stores/projects/cloudProjectStore';
import type { Project } from './store';

export interface DisplayProject {
  id: string;
  name: string;
  description: string;
  instructions: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  iconId?: string | null;
  accentId?: string | null;
}

export type ProjectSort = 'recent' | 'name' | 'active';
export type ProjectFilter = 'all' | 'mine' | 'shared' | 'archived';

export const SORT_LABELS: Record<ProjectSort, string> = {
  recent: 'Recently updated',
  name: 'Name',
  active: 'Active first',
};

export const FILTER_LABELS: Record<ProjectFilter, string> = {
  all: 'All',
  mine: 'Created by you',
  shared: 'Shared with you',
  archived: 'Archived',
};

export const CLOUD_PROJECT_FILTERS: readonly ProjectFilter[] = [
  'all',
  'mine',
  'shared',
  'archived',
];

export function isCloudProjectPinned(project: Pick<CloudProject, 'metadata'>): boolean {
  return project.metadata?.['starred'] === true;
}

export function localProjectToDisplay(project: Project): DisplayProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    instructions: project.instructions ?? '',
    updatedAt: project.updatedAt,
    pinned: project.pinned === true,
    archived: false,
  };
}

export function cloudProjectToDisplay(
  project: CloudProject,
  details: CloudProjectDetails | undefined,
): DisplayProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    instructions: project.instructions ?? '',
    updatedAt: project.updatedAt,
    pinned: isCloudProjectPinned(project),
    archived: project.isArchived,
    iconId: details?.iconEmoji ?? null,
    accentId: details?.accentColor ?? null,
  };
}

export function pinnedFirst<T extends { pinned?: boolean }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true));
}

export function sortDisplayProjects(
  projects: readonly DisplayProject[],
  sort: ProjectSort,
  activeProjectId: string | null,
): DisplayProject[] {
  const sorted = [...projects];
  if (sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (sort === 'active') {
      sorted.sort((a, b) => Number(b.id === activeProjectId) - Number(a.id === activeProjectId));
    }
  }
  return pinnedFirst(sorted);
}

export function projectsForFilter(
  projects: readonly DisplayProject[],
  filter: ProjectFilter,
): DisplayProject[] {
  if (filter === 'shared') return [];
  return projects.filter((project) => project.archived === (filter === 'archived'));
}
