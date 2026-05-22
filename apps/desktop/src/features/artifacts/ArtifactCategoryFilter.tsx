/**
 * ArtifactCategoryFilter Component
 *
 * Horizontal row of filter pills for browsing artifacts by category.
 * Each pill maps to a subset of ArtifactType values (or "all").
 */

import { Code, Database, FileText, GitBranch, Globe, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

export type ArtifactCategory = 'all' | 'code' | 'documents' | 'diagrams' | 'web' | 'data' | 'other';

interface CategoryConfig {
  label: string;
  icon: React.ReactNode;
}

interface ArtifactCategoryFilterProps {
  selected: ArtifactCategory;
  onChange: (category: ArtifactCategory) => void;
}

// =============================================================================
// Config
// =============================================================================

const CATEGORY_CONFIGS: Record<ArtifactCategory, CategoryConfig> = {
  all: {
    label: 'All',
    icon: <Layers className="h-3.5 w-3.5" />,
  },
  code: {
    label: 'Code',
    icon: <Code className="h-3.5 w-3.5" />,
  },
  documents: {
    label: 'Documents',
    icon: <FileText className="h-3.5 w-3.5" />,
  },
  diagrams: {
    label: 'Diagrams',
    icon: <GitBranch className="h-3.5 w-3.5" />,
  },
  web: {
    label: 'Web',
    icon: <Globe className="h-3.5 w-3.5" />,
  },
  data: {
    label: 'Data',
    icon: <Database className="h-3.5 w-3.5" />,
  },
  other: {
    label: 'Other',
    icon: <Layers className="h-3.5 w-3.5" />,
  },
};

const CATEGORY_ORDER: ArtifactCategory[] = [
  'all',
  'code',
  'documents',
  'diagrams',
  'web',
  'data',
  'other',
];

// =============================================================================
// Component
// =============================================================================

export function ArtifactCategoryFilter({ selected, onChange }: ArtifactCategoryFilterProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-4 py-2">
      {CATEGORY_ORDER.map((category) => {
        const config = CATEGORY_CONFIGS[category];
        const isActive = selected === category;

        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              isActive
                ? 'bg-white/10 text-white'
                : 'bg-transparent text-white/50 hover:text-white/75 hover:bg-white/5',
            )}
          >
            {config.icon}
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
