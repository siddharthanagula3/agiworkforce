import type { ManagedSkillSummary } from '@agiworkforce/cloud-contracts';
import type {
  DirectoryEntry,
  DirectoryFilterGroup,
  DirectorySection,
  DirectorySkillDetail,
  DirectorySourceChip,
} from '@agiworkforce/ui';

import {
  DIRECTORY_SOURCE_AGI,
  DIRECTORY_SOURCE_LABEL_AGI,
  DIRECTORY_SOURCE_LABEL_YOURS,
  DIRECTORY_SOURCE_YOURS,
  SKILLS_PATH,
  SKILL_LIFECYCLE_DRAFT_LABEL,
  SKILL_LIFECYCLE_GROUP_ID,
  SKILL_LIFECYCLE_GROUP_LABEL,
  SKILL_LIFECYCLE_INCLUDED_LABEL,
  SKILL_PUBLISHER_AGI,
  SKILL_PUBLISHER_MANAGED,
  SKILL_PUBLISHER_YOU,
} from '../constants';

const OWNED_SOURCES = new Set(['personal', 'project', 'workspace']);

export function skillPublisher(source: string): string {
  if (OWNED_SOURCES.has(source)) return SKILL_PUBLISHER_YOU;
  if (source === 'managed-local') return SKILL_PUBLISHER_MANAGED;
  return SKILL_PUBLISHER_AGI;
}

function skillSourceId(source: string): string {
  return OWNED_SOURCES.has(source) ? DIRECTORY_SOURCE_YOURS : DIRECTORY_SOURCE_AGI;
}

export function toSkillEntry(skill: ManagedSkillSummary): DirectoryEntry {
  return {
    id: skill.name,
    name: skill.name,
    slashName: true,
    publisher: skillPublisher(skill.source),
    description: skill.description,
    sourceId: skillSourceId(skill.source),
    badges: [skillSourceId(skill.source) === DIRECTORY_SOURCE_YOURS ? 'yours' : 'agi'],
    facets: { [SKILL_LIFECYCLE_GROUP_ID]: [skill.lifecycle] },
  };
}

function skillSources(entries: readonly DirectoryEntry[]): DirectorySourceChip[] {
  const present = new Set(entries.map((entry) => entry.sourceId));
  const chips: DirectorySourceChip[] = [];
  if (present.has(DIRECTORY_SOURCE_AGI))
    chips.push({ id: DIRECTORY_SOURCE_AGI, label: DIRECTORY_SOURCE_LABEL_AGI });
  if (present.has(DIRECTORY_SOURCE_YOURS))
    chips.push({ id: DIRECTORY_SOURCE_YOURS, label: DIRECTORY_SOURCE_LABEL_YOURS });
  return chips;
}

function skillFilterGroups(skills: readonly ManagedSkillSummary[]): DirectoryFilterGroup[] {
  const lifecycles = new Set(skills.map((skill) => skill.lifecycle));
  if (lifecycles.size < 2) return [];
  return [
    {
      id: SKILL_LIFECYCLE_GROUP_ID,
      label: SKILL_LIFECYCLE_GROUP_LABEL,
      options: [
        { value: 'included', label: SKILL_LIFECYCLE_INCLUDED_LABEL },
        { value: 'draft', label: SKILL_LIFECYCLE_DRAFT_LABEL },
      ],
    },
  ];
}

export function toSkillSection(skills: readonly ManagedSkillSummary[]): DirectorySection {
  const entries = skills.map(toSkillEntry);
  return {
    entries,
    sources: skillSources(entries),
    filterGroups: skillFilterGroups(skills),
    sortOptions: ['name'],
  };
}

export async function fetchSkillDetail(
  id: string,
  skills: readonly ManagedSkillSummary[],
): Promise<DirectorySkillDetail | null> {
  const summary = skills.find((skill) => skill.name === id);
  if (!summary) return null;
  const response = await fetch(`${SKILLS_PATH}/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`skill detail failed: ${response.status}`);
  const body = (await response.json()) as { body?: string };
  return {
    kind: 'skill',
    id: summary.name,
    name: summary.name,
    publisher: skillPublisher(summary.source),
    description: summary.description,
    files: [{ path: 'SKILL.md', content: body.body ?? '' }],
    ...(summary.editable ? { editable: true } : {}),
  };
}
