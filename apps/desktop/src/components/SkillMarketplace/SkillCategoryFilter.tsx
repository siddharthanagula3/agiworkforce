/**
 * SkillCategoryFilter
 *
 * Horizontal tab-strip that filters skills by category.
 * Shows count badges pulled from the store selector.
 */
import {
  BookOpen,
  Briefcase,
  Code2,
  Heart,
  Layers,
  Palette,
  Scale,
  ShoppingBag,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import {
  selectCategoryCounts,
  useSkillMarketplaceStore,
  type SkillCategory,
} from '../../stores/skillMarketplaceStore';

interface CategoryMeta {
  label: string;
  icon: ReactNode;
}

const CATEGORY_META: Record<SkillCategory, CategoryMeta> = {
  all: { label: 'All', icon: <Layers className="h-3.5 w-3.5" /> },
  healthcare: { label: 'Healthcare', icon: <Heart className="h-3.5 w-3.5" /> },
  legal: { label: 'Legal', icon: <Scale className="h-3.5 w-3.5" /> },
  finance: { label: 'Finance', icon: <Briefcase className="h-3.5 w-3.5" /> },
  education: { label: 'Education', icon: <BookOpen className="h-3.5 w-3.5" /> },
  creative: { label: 'Creative', icon: <Palette className="h-3.5 w-3.5" /> },
  trades: { label: 'Trades', icon: <Wrench className="h-3.5 w-3.5" /> },
  'e-commerce': { label: 'E-Commerce', icon: <ShoppingBag className="h-3.5 w-3.5" /> },
  technology: { label: 'Technology', icon: <Code2 className="h-3.5 w-3.5" /> },
  productivity: { label: 'Productivity', icon: <Layers className="h-3.5 w-3.5" /> },
};

const ORDERED_CATEGORIES: SkillCategory[] = [
  'all',
  'technology',
  'productivity',
  'creative',
  'finance',
  'healthcare',
  'education',
  'legal',
  'e-commerce',
  'trades',
];

export function SkillCategoryFilter() {
  const selectedCategory = useSkillMarketplaceStore((s) => s.selectedCategory);
  const setCategory = useSkillMarketplaceStore((s) => s.setCategory);
  const counts = useSkillMarketplaceStore(selectCategoryCounts);

  return (
    <div role="tablist" aria-label="Filter skills by category" className="flex flex-wrap gap-1.5">
      {ORDERED_CATEGORIES.map((cat) => {
        const meta = CATEGORY_META[cat];
        const count = counts[cat] ?? 0;
        const isActive = selectedCategory === cat;

        return (
          <button
            key={cat}
            role="tab"
            aria-selected={isActive}
            onClick={() => setCategory(cat)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {meta.icon}
            {meta.label}
            {count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
