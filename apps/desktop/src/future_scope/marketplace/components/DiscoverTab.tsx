import { ArrowRight, Flame, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '../../../components/ui/Button';
import { ScrollArea } from '../../../components/ui/ScrollArea';
import { Skeleton } from '../../../components/ui/Skeleton';
import { WORKFLOW_CATEGORIES } from '../../../types/marketplace';
import { useMarketplaceStore } from '../marketplaceStore';
import { WorkflowCard } from './WorkflowCard';
import { WorkflowSearch } from './WorkflowSearch';

export function DiscoverTab() {
  const {
    workflows,
    featuredWorkflows,
    trendingWorkflows,
    categoryCounts,
    popularTags,
    isLoading,
    filters,
    setFilter,
    fetchWorkflows,
  } = useMarketplaceStore();

  useEffect(() => {
    // Fetch workflows when filters change
    fetchWorkflows();
  }, [fetchWorkflows, filters.category, filters.sortBy]);

  return (
    <div className="space-y-8">
      {/* Search and Filters */}
      <WorkflowSearch />

      {/* Featured Section */}
      {featuredWorkflows.length > 0 && filters.category === 'all' && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-yellow-500" />
              <h2 className="text-3xl font-bold">Featured by AGI Workforce</h2>
            </div>
          </div>

          {/* Large Featured Card */}
          {featuredWorkflows[0] && (
            <div className="mb-6">
              <WorkflowCard workflow={featuredWorkflows[0]} />
            </div>
          )}

          {/* Additional Featured (2 columns) */}
          {featuredWorkflows.length > 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featuredWorkflows.slice(1, 3).map((workflow) => (
                <WorkflowCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Trending Section */}
      {trendingWorkflows.length > 0 && filters.category === 'all' && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Flame className="h-6 w-6 text-orange-500" />
              <h2 className="text-3xl font-bold">Trending This Week</h2>
            </div>
          </div>

          {/* Horizontal Scroll */}
          <ScrollArea className="w-full">
            <div className="flex gap-6 pb-4">
              {trendingWorkflows.map((workflow) => (
                <div key={workflow.id} className="w-[350px] flex-shrink-0">
                  <WorkflowCard workflow={workflow} />
                </div>
              ))}
            </div>
          </ScrollArea>
        </section>
      )}

      {/* Categories Section */}
      {filters.category === 'all' && (
        <section>
          <h2 className="text-3xl font-bold mb-6">Browse by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {WORKFLOW_CATEGORIES.map((category) => {
              const count = categoryCounts.find((c) => c.category === category.value)?.count || 0;
              return (
                <CategoryCard
                  key={category.value}
                  label={category.label}
                  description={category.description}
                  count={count}
                  onClick={() => setFilter('category', category.value)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Popular Tags Section */}
      {filters.category === 'all' && popularTags.length > 0 && (
        <section>
          <h2 className="text-3xl font-bold mb-4">Popular Tags</h2>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tagObj) => (
              <button
                key={tagObj.tag}
                onClick={() => {
                  setFilter('tags', [...filters.tags, tagObj.tag]);
                  fetchWorkflows();
                }}
                className="px-4 py-2 rounded-full bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors"
              >
                #{tagObj.tag} ({tagObj.count})
              </button>
            ))}
          </div>
        </section>
      )}

      {/* All Workflows Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold">
            {filters.category === 'all'
              ? 'All Workflows'
              : WORKFLOW_CATEGORIES.find((c) => c.value === filters.category)?.label || 'Workflows'}
          </h2>
          {filters.category !== 'all' && (
            <Button variant="ghost" onClick={() => setFilter('category', 'all')}>
              View All Categories
            </Button>
          )}
        </div>

        {isLoading ? (
          <LoadingGrid />
        ) : workflows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {workflows.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface CategoryCardProps {
  label: string;
  description: string;
  count: number;
  onClick: () => void;
}

function CategoryCard({ label, description, count, onClick }: CategoryCardProps) {
  return (
    <button
      onClick={onClick}
      className="group p-6 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
            {label}
          </h3>
          {count > 0 && <span className="text-xs text-muted-foreground">{count} workflows</span>}
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">🔍</div>
      <h3 className="text-2xl font-semibold mb-2">No workflows found</h3>
      <p className="text-muted-foreground mb-6">
        Try adjusting your search or filters to find more workflows
      </p>
      <Button onClick={() => useMarketplaceStore.getState().resetFilters()}>Clear Filters</Button>
    </div>
  );
}
