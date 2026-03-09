/**
 * SkillMarketplace
 *
 * Full-panel browser for the 140+ AGI Workforce AI skills.
 * Features: grid/list toggle, category filter tabs, debounced search,
 * expandable skill cards with active/inactive toggle.
 *
 * Data flows:
 *   mount → skill_list (invoke) → useSkillMarketplaceStore
 *   skill_reload (invoke) → re-fetch on manual reload
 */
import { LayoutGrid, List, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { SkillCard } from './SkillCard';
import { SkillCategoryFilter } from './SkillCategoryFilter';
import { SkillSearchBar } from './SkillSearchBar';
import { selectFilteredSkills, useSkillMarketplaceStore } from '../../stores/skillMarketplaceStore';

// ── Skeleton placeholder grid ─────────────────────────────────────────────────

function SkillCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-16 rounded-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex items-center justify-between pt-1 border-t border-border mt-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <SkillCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  const setSearchQuery = useSkillMarketplaceStore((s) => s.setSearchQuery);
  const setCategory = useSkillMarketplaceStore((s) => s.setCategory);

  const handleReset = () => {
    setSearchQuery('');
    setCategory('all');
  };

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Sparkles className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasQuery ? 'No skills match your search' : 'No skills in this category'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {hasQuery
            ? 'Try a different keyword or category'
            : 'Select a different category to explore'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={handleReset}>
        Clear filters
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SkillMarketplace() {
  const isLoading = useSkillMarketplaceStore((s) => s.isLoading);
  const error = useSkillMarketplaceStore((s) => s.error);
  const viewMode = useSkillMarketplaceStore((s) => s.viewMode);
  const setViewMode = useSkillMarketplaceStore((s) => s.setViewMode);
  const fetchSkills = useSkillMarketplaceStore((s) => s.fetchSkills);
  const reloadSkills = useSkillMarketplaceStore((s) => s.reloadSkills);
  const totalCount = useSkillMarketplaceStore((s) => s.skills.length);
  const searchQuery = useSkillMarketplaceStore((s) => s.searchQuery);
  const selectedCategory = useSkillMarketplaceStore((s) => s.selectedCategory);

  // Use the selector via the hook to stay reactive
  const filteredSkills = useSkillMarketplaceStore(selectFilteredSkills);

  // Load on mount — idempotent if already loaded
  useEffect(() => {
    if (totalCount === 0 && !isLoading) {
      void fetchSkills();
    }
  }, [fetchSkills, totalCount, isLoading]);

  const hasActiveFilter = searchQuery.trim() !== '' || selectedCategory !== 'all';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Skill Marketplace</h2>
              <p className="text-xs text-muted-foreground">
                {isLoading ? 'Loading skills…' : `${totalCount} AI skills available`}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Reload */}
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading}
              onClick={() => void reloadSkills()}
              aria-label="Reload skills"
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>

            {/* View mode toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center transition-colors',
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center border-l border-border transition-colors',
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 mb-3">
          <SkillSearchBar />
        </div>

        {/* Category filter */}
        <SkillCategoryFilter />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Error banner */}
        {error && !isLoading && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-destructive hover:text-destructive"
              onClick={() => void fetchSkills()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && <LoadingGrid />}

        {/* Skill grid */}
        {!isLoading && filteredSkills.length > 0 && (
          <>
            {/* Result count */}
            <p className="mb-3 text-xs text-muted-foreground">
              {filteredSkills.length === totalCount
                ? `Showing all ${totalCount} skills`
                : `${filteredSkills.length} of ${totalCount} skills`}
            </p>

            <div
              className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
                  : 'flex flex-col gap-2',
              )}
              role="list"
              aria-label="Skills"
            >
              {filteredSkills.map((skill) => (
                <div key={skill.name} role="listitem">
                  <SkillCard skill={skill} viewMode={viewMode} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {!isLoading && filteredSkills.length === 0 && !error && (
          <EmptyState hasQuery={hasActiveFilter} />
        )}
      </div>
    </div>
  );
}
