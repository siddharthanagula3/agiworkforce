import {
  cloudProjectToDisplay,
  isCloudProjectPinned,
  localProjectToDisplay,
  pinnedFirst,
  projectsForFilter,
  sortDisplayProjects,
  type DisplayProject,
} from '@/src/features/projects/projectList';
import type { CloudProject } from '@/stores/projects/cloudProjectStore';

function display(id: string, updatedAt: string, overrides: Partial<DisplayProject> = {}) {
  return {
    id,
    name: id,
    description: '',
    instructions: '',
    updatedAt,
    pinned: false,
    archived: false,
    ...overrides,
  } satisfies DisplayProject;
}

const cloud: CloudProject = {
  id: 'c1',
  name: 'Cloud',
  description: null,
  instructions: null,
  color: null,
  isArchived: false,
  metadata: null,
  source: 'web',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
  deletedAt: null,
};

describe('project list helpers', () => {
  it('reads the pin from the metadata field the web app stores as starred', () => {
    expect(isCloudProjectPinned({ metadata: { starred: true } })).toBe(true);
    expect(isCloudProjectPinned({ metadata: { starred: false } })).toBe(false);
    expect(isCloudProjectPinned({ metadata: { starred: 'yes' } })).toBe(false);
    expect(isCloudProjectPinned({ metadata: null })).toBe(false);
  });

  it('maps pin and archived state from each mode', () => {
    expect(
      localProjectToDisplay({
        id: 'l1',
        name: 'Local',
        description: '',
        instructions: '',
        pinned: true,
        createdAt: cloud.createdAt,
        updatedAt: cloud.updatedAt,
      }),
    ).toMatchObject({ pinned: true, archived: false });
    expect(
      cloudProjectToDisplay({ ...cloud, isArchived: true, metadata: { starred: true } }, undefined),
    ).toMatchObject({ pinned: true, archived: true });
  });

  it('puts pinned items first and keeps the existing order inside each group', () => {
    expect(
      pinnedFirst([
        { id: 'a' },
        { id: 'b', pinned: true },
        { id: 'c' },
        { id: 'd', pinned: true },
      ]).map((item) => item.id),
    ).toEqual(['b', 'd', 'a', 'c']);
  });

  it('sorts pinned projects first under every sort order', () => {
    const projects = [
      display('b-new', '2026-07-30T10:00:00.000Z'),
      display('a-old', '2026-07-01T10:00:00.000Z', { pinned: true }),
      display('c-mid', '2026-07-15T10:00:00.000Z'),
    ];

    const ids = (sort: 'recent' | 'name' | 'active', active: string | null) =>
      sortDisplayProjects(projects, sort, active).map((project) => project.id);

    expect(ids('recent', null)).toEqual(['a-old', 'b-new', 'c-mid']);
    expect(ids('name', null)).toEqual(['a-old', 'b-new', 'c-mid']);
    expect(ids('active', 'c-mid')).toEqual(['a-old', 'c-mid', 'b-new']);
  });

  it('filters by archived state and returns nothing for the shared filter', () => {
    const projects = [
      display('live', '2026-07-01T10:00:00.000Z'),
      display('gone', '2026-07-01T10:00:00.000Z', { archived: true }),
    ];

    expect(projectsForFilter(projects, 'all').map((p) => p.id)).toEqual(['live']);
    expect(projectsForFilter(projects, 'mine').map((p) => p.id)).toEqual(['live']);
    expect(projectsForFilter(projects, 'archived').map((p) => p.id)).toEqual(['gone']);
    expect(projectsForFilter(projects, 'shared')).toEqual([]);
  });
});
