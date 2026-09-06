import { OTHER_CATEGORY, type DirectoryCategory } from '@/lib/connectors/directory/categorize';
import type { DirectoryMonogramHue } from '@/lib/connectors/directory/types';

const MONOGRAM_MAX_LETTERS = 2;
const FALLBACK_MONOGRAM = '?';
const LEADING_ALPHANUMERIC = /[\p{L}\p{N}]/u;

const CATEGORY_HUES: Readonly<Record<DirectoryCategory, DirectoryMonogramHue>> = {
  Code: 'code',
  Communication: 'communication',
  Data: 'data',
  Design: 'design',
  'Financial services': 'financial-services',
  Health: 'health',
  Legal: 'legal',
  'Life sciences': 'life-sciences',
  Productivity: 'productivity',
  'Sales and marketing': 'sales-and-marketing',
  Other: 'other',
};

function isDirectoryCategory(value: string): value is DirectoryCategory {
  return value in CATEGORY_HUES;
}

export function deriveMonogram(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/u)
    .map((word) => word.match(LEADING_ALPHANUMERIC)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, MONOGRAM_MAX_LETTERS)
    .map((letter) => letter.toUpperCase());
  return letters.join('') || FALLBACK_MONOGRAM;
}

export function deriveMonogramHue(categories: readonly string[]): DirectoryMonogramHue {
  const primary = categories.find(isDirectoryCategory) ?? OTHER_CATEGORY;
  return CATEGORY_HUES[primary];
}
