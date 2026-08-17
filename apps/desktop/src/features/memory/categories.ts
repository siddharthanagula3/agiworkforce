import { MEMORY_CATEGORIES, type MemoryCategory, type MemoryEntry } from '@/stores/memoryStore';

export type MemoryTabValue = 'all' | MemoryCategory;

export interface MemoryCategoryPresentation {
  label: string;
  plural: string;
  description: string;
  colors: { bg: string; text: string; border: string };
}

export const MEMORY_CATEGORY_PRESENTATION: Record<MemoryCategory, MemoryCategoryPresentation> = {
  preference: {
    label: 'Preference',
    plural: 'Preferences',
    description: 'User preferences and settings',
    colors: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-500/30',
    },
  },
  fact: {
    label: 'Fact',
    plural: 'Facts',
    description: 'Factual information about the user or project',
    colors: {
      bg: 'bg-green-500/10',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-500/30',
    },
  },
  decision: {
    label: 'Decision',
    plural: 'Decisions',
    description: 'Past decisions and their context',
    colors: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-500/30',
    },
  },
  context: {
    label: 'Context',
    plural: 'Context memories',
    description: 'Contextual information for better understanding',
    colors: {
      bg: 'bg-gray-500/10',
      text: 'text-gray-700 dark:text-gray-300',
      border: 'border-gray-500/30',
    },
  },
  summary: {
    label: 'Summary',
    plural: 'Summaries',
    description: 'Condensed recaps of earlier conversations',
    colors: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-500/30',
    },
  },
  skill: {
    label: 'Skill',
    plural: 'Skills',
    description: 'Capabilities and workflows the assistant has learned',
    colors: {
      bg: 'bg-teal-500/10',
      text: 'text-teal-700 dark:text-teal-300',
      border: 'border-teal-500/30',
    },
  },
};

export const MEMORY_TAB_OPTIONS: { value: MemoryTabValue; label: string }[] = [
  { value: 'all', label: 'All' },
  ...MEMORY_CATEGORIES.map((category) => ({
    value: category as MemoryTabValue,
    label: MEMORY_CATEGORY_PRESENTATION[category].plural,
  })),
];

export const MEMORY_TAB_EMPTY_LABELS: Record<MemoryTabValue, string> = {
  all: 'memories',
  ...(Object.fromEntries(
    MEMORY_CATEGORIES.map((category) => [
      category,
      MEMORY_CATEGORY_PRESENTATION[category].plural.toLowerCase(),
    ]),
  ) as Record<MemoryCategory, string>),
};

export function countMemoriesByCategory(memories: MemoryEntry[]): Record<MemoryTabValue, number> {
  const counts = {
    all: memories.length,
    ...(Object.fromEntries(MEMORY_CATEGORIES.map((category) => [category, 0])) as Record<
      MemoryCategory,
      number
    >),
  };
  for (const memory of memories) {
    if (memory.category in counts) counts[memory.category] += 1;
  }
  return counts;
}
