import { useMemo } from 'react';
import { Plus, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useSkillsStore } from '../../stores/skillsStore';
import type { SkillCategory, SkillFilter } from '../../stores/skillsStore';
import { SkillCard } from './SkillCard';

// ── Filter tab config ─────────────────────────────────────────────────────────

interface FilterTab {
  id: SkillFilter;
  label: string;
}

const FILTER_TABS: FilterTab[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My Skills' },
  { id: 'examples', label: 'Example Skills' },
];

// ── Category options ──────────────────────────────────────────────────────────

interface CategoryOption {
  id: SkillCategory;
  label: string;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { id: 'all', label: 'All Categories' },
  { id: 'coding', label: 'Coding' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'legal', label: 'Legal' },
  { id: 'sales', label: 'Sales' },
  { id: 'research', label: 'Research' },
  { id: 'writing', label: 'Writing' },
  { id: 'finance', label: 'Finance' },
  { id: 'support', label: 'Support' },
];

// ── Empty state per tab ───────────────────────────────────────────────────────

interface EmptyStateProps {
  filter: SkillFilter;
  hasSearch: boolean;
}

function EmptyState({ filter, hasSearch }: EmptyStateProps) {
  if (hasSearch) {
    return (
      <div className="col-span-3 flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Search className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No skills match your search</p>
        <p className="text-xs text-muted-foreground">Try a different keyword or clear the filter</p>
      </div>
    );
  }

  if (filter === 'mine') {
    return (
      <div className="col-span-3 flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No skills created yet</p>
        <p className="text-xs text-muted-foreground">
          Create your first skill to teach the agent a new capability
        </p>
      </div>
    );
  }

  return (
    <div className="col-span-3 flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No skills found</p>
      <p className="text-xs text-muted-foreground">Adjust your category filter to see more</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SkillsMarketplace() {
  const { skills, filter, categoryFilter, searchQuery, setFilter, setCategoryFilter, setSearch } =
    useSkillsStore(
      useShallow((s) => ({
        skills: s.skills,
        filter: s.filter,
        categoryFilter: s.categoryFilter,
        searchQuery: s.searchQuery,
        setFilter: s.setFilter,
        setCategoryFilter: s.setCategoryFilter,
        setSearch: s.setSearch,
      })),
    );

  // Derived list — computed in the component (no extra store state needed)
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Tab filter
    if (filter === 'mine') {
      result = result.filter((s) => !s.isExample || s.isInstalled);
    } else if (filter === 'examples') {
      result = result.filter((s) => s.isExample);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((s) => s.category === categoryFilter);
    }

    // Search filter (name + description + tags)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [skills, filter, categoryFilter, searchQuery]);

  const handleCreateSkill = () => {
    toast.info('Skill creator — coming soon');
  };

  const installedCount = skills.filter((s) => s.isInstalled).length;
  const mySkillsCount = skills.filter((s) => !s.isExample || s.isInstalled).length;
  const examplesCount = skills.filter((s) => s.isExample).length;

  const tabCounts: Record<SkillFilter, number> = {
    all: skills.length,
    mine: mySkillsCount,
    examples: examplesCount,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top header ── */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Skills</h1>
          {installedCount > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              {installedCount} installed
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'h-8 w-52 rounded-md border border-input bg-background pl-8 pr-3 text-sm',
                'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>

          {/* Create skill button */}
          <Button size="sm" onClick={handleCreateSkill} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create skill
          </Button>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-2.5">
        {/* Tab filters */}
        <div className="flex items-center gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === tab.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs',
                  filter === tab.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {tabCounts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Category dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="category-filter" className="text-xs text-muted-foreground">
            Category:
          </label>
          <select
            id="category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as SkillCategory)}
            className={cn(
              'h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Skill grid ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {filteredSkills.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EmptyState filter={filter} hasSearch={searchQuery.trim().length > 0} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
