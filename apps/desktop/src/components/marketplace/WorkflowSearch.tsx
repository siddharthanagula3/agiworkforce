import React from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { WORKFLOW_CATEGORIES } from '../../types/marketplace';

export function WorkflowSearch() {
  const { filters, setFilter, resetFilters, applyFilters } = useMarketplaceStore();

  const handleSortChange = (value: string) => {
    setFilter('sortBy', value);
    applyFilters();
  };

  const handleCategoryChange = (value: string) => {
    setFilter('category', value);
    applyFilters();
  };

  const hasActiveFilters =
    filters.category !== 'all' ||
    filters.sortBy !== 'popular' ||
    filters.minRating !== undefined ||
    filters.verifiedOnly ||
    filters.featuredOnly ||
    filters.tags.length > 0;

  return (
    <div className="space-y-4 p-6 bg-card rounded-lg border">
      <div className="flex items-center gap-3">
        <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Filters & Sort</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="ml-auto"
          >
            <X className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Category Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Category</label>
          <Select value={filters.category} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {WORKFLOW_CATEGORIES.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort By */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Sort By</label>
          <Select value={filters.sortBy} onValueChange={handleSortChange}>
            <SelectTrigger>
              <SelectValue placeholder="Most Popular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popular">Most Popular</SelectItem>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="trending">Trending</SelectItem>
              <SelectItem value="highest_rated">Highest Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Min Rating */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Minimum Rating</label>
          <Select
            value={filters.minRating?.toString() || 'none'}
            onValueChange={(value) => {
              setFilter('minRating', value === 'none' ? undefined : parseFloat(value));
              applyFilters();
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Any Rating</SelectItem>
              <SelectItem value="4.5">4.5+ Stars</SelectItem>
              <SelectItem value="4.0">4.0+ Stars</SelectItem>
              <SelectItem value="3.5">3.5+ Stars</SelectItem>
              <SelectItem value="3.0">3.0+ Stars</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick Filter Badges */}
      <div className="flex flex-wrap gap-2">
        <FilterBadge
          label="Featured Only"
          active={filters.featuredOnly}
          onClick={() => {
            setFilter('featuredOnly', !filters.featuredOnly);
            applyFilters();
          }}
        />
        <FilterBadge
          label="Verified Only"
          active={filters.verifiedOnly}
          onClick={() => {
            setFilter('verifiedOnly', !filters.verifiedOnly);
            applyFilters();
          }}
        />
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="pt-4 border-t">
          <div className="flex flex-wrap gap-2">
            {filters.category !== 'all' && (
              <ActiveFilterBadge
                label={`Category: ${WORKFLOW_CATEGORIES.find((c) => c.value === filters.category)?.label}`}
                onRemove={() => {
                  setFilter('category', 'all');
                  applyFilters();
                }}
              />
            )}
            {filters.minRating && (
              <ActiveFilterBadge
                label={`Rating: ${filters.minRating}+`}
                onRemove={() => {
                  setFilter('minRating', undefined);
                  applyFilters();
                }}
              />
            )}
            {filters.featuredOnly && (
              <ActiveFilterBadge
                label="Featured"
                onRemove={() => {
                  setFilter('featuredOnly', false);
                  applyFilters();
                }}
              />
            )}
            {filters.verifiedOnly && (
              <ActiveFilterBadge
                label="Verified"
                onRemove={() => {
                  setFilter('verifiedOnly', false);
                  applyFilters();
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterBadgeProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterBadge({ label, active, onClick }: FilterBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
      }`}
    >
      {label}
    </button>
  );
}

interface ActiveFilterBadgeProps {
  label: string;
  onRemove: () => void;
}

function ActiveFilterBadge({ label, onRemove }: ActiveFilterBadgeProps) {
  return (
    <Badge variant="secondary" className="gap-2 pr-1">
      <span>{label}</span>
      <button
        onClick={onRemove}
        className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
