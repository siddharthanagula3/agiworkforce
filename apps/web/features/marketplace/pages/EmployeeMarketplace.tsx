'use client';

/**
 * AI Agents Marketplace Page
 * Browse AI agents and start conversations with them
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Badge } from '@shared/ui/badge';
import {
  Search,
  Bot,
  Users,
  TrendingUp,
  Code,
  Palette,
  BarChart3,
  Camera,
  DollarSign,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useBusinessMetrics } from '@shared/hooks/useAnalytics';
import { queryKeys } from '@shared/stores/query-client';
import ErrorBoundary from '@shared/components/ErrorBoundary';
import {
  EmployeeCard,
  EmployeeGridSkeleton,
  type AIEmployee,
} from '@features/marketplace/components';
import { AI_EMPLOYEES } from '@/data/marketplace-employees';

interface MarketplacePageProps {
  className?: string;
}

const categories = [
  { id: 'all', label: 'All', icon: Bot },
  { id: 'engineering', label: 'Engineering', icon: Code },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'product', label: 'Product', icon: TrendingUp },
  { id: 'data', label: 'Data & Analytics', icon: BarChart3 },
  { id: 'marketing', label: 'Marketing', icon: Camera },
  { id: 'sales', label: 'Sales', icon: DollarSign },
  { id: 'general', label: 'General', icon: Bot },
];

export const MarketplacePage: React.FC<MarketplacePageProps> = ({ className }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { trackMarketplaceView } = useBusinessMetrics();

  // Track marketplace view on component mount
  useEffect(() => {
    trackMarketplaceView(undefined, selectedCategory, {
      searchQuery,
      sortBy,
      viewMode,
    });
  }, [trackMarketplaceView, selectedCategory, searchQuery, sortBy, viewMode]);

  // Fetch AI agents using React Query
  const { data: employees = [], isLoading } = useQuery<AIEmployee[]>({
    queryKey: queryKeys.employees.marketplace({
      category: selectedCategory,
      search: searchQuery,
      sortBy,
    }),
    queryFn: async () => {
      let filteredEmployees = [...AI_EMPLOYEES];

      // Apply category filter
      if (selectedCategory !== 'all') {
        filteredEmployees = filteredEmployees.filter(
          (e) => e.category.toLowerCase() === selectedCategory.toLowerCase(),
        );
      }

      // Apply search filter
      if (searchQuery) {
        const searchTerm = searchQuery.toLowerCase();
        filteredEmployees = filteredEmployees.filter(
          (e) =>
            e.name.toLowerCase().includes(searchTerm) ||
            (e.role?.toLowerCase().includes(searchTerm) ?? false) ||
            e.description.toLowerCase().includes(searchTerm) ||
            e.skills?.some((s) => s.toLowerCase().includes(searchTerm)),
        );
      }

      // Transform to card format
      const transformedEmployees = filteredEmployees.map((emp) => ({
        id: emp.id,
        name: emp.name,
        role: emp.role || emp.specialty || 'AI Specialist',
        category: emp.category,
        description: emp.description,
        provider: emp.provider as string,
        avatar: emp.avatar,
        skills: emp.skills || [],
        specialty: emp.specialty,
        fitLevel: emp.fitLevel || ('excellent' as const),
        popular: emp.popular || false,
        defaultTools: emp.defaultTools || [],
      }));

      // Apply sorting
      switch (sortBy) {
        case 'newest':
          transformedEmployees.sort((a, b) => b.id.localeCompare(a.id));
          break;
        case 'popular':
        default:
          transformedEmployees.sort((a, b) => {
            const aScore = a.popular ? 1 : 0;
            const bScore = b.popular ? 1 : 0;
            return bScore - aScore;
          });
          break;
      }

      return transformedEmployees;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold">Marketplace Unavailable</h2>
            <p className="mt-2 text-muted-foreground">
              Something went wrong loading the marketplace. Please refresh the page.
            </p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Refresh Page
            </Button>
          </div>
        </div>
      }
    >
      <div className={cn('space-y-4 p-4 md:space-y-6 md:p-6', className)}>
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              AI Agents
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Browse AI agents and their skills. Click any agent to start a conversation.
            </p>
          </div>
          <Badge variant="outline" className="border-border text-xs md:text-sm">
            <Users className="mr-1 h-3 w-3" />
            {employees.length} Available
          </Badge>
        </div>

        {/* Search and Filters */}
        <Card className="border-border bg-card">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                  <Input
                    placeholder="Search agents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border-border bg-background pl-10 text-sm"
                    aria-label="Search AI agents by name, role, or skills"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                {categories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <Button
                      key={category.id}
                      variant={selectedCategory === category.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCategory(category.id)}
                      className="whitespace-nowrap text-xs md:text-sm"
                      aria-label={`Filter by ${category.label} category`}
                      aria-pressed={selectedCategory === category.id}
                    >
                      <Icon className="mr-1 h-3 w-3 md:h-4 md:w-4" />
                      <span className="hidden sm:inline">{category.label}</span>
                      <span className="sm:hidden">
                        {category.id === 'all'
                          ? 'All'
                          : category.id === 'engineering'
                            ? 'Eng'
                            : category.id === 'design'
                              ? 'Design'
                              : category.id === 'product'
                                ? 'Prod'
                                : category.id === 'data'
                                  ? 'Data'
                                  : category.id === 'marketing'
                                    ? 'Mktg'
                                    : category.id === 'sales'
                                      ? 'Sales'
                                      : 'Gen'}
                      </span>
                    </Button>
                  );
                })}
              </div>

              {/* Sort and View Toggle */}
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground md:px-3 md:text-sm"
                  aria-label="Sort agents by criteria"
                >
                  <option value="popular">Most Popular</option>
                  <option value="newest">Newest</option>
                </select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  className="hidden border-border md:flex"
                  aria-label={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
                >
                  {viewMode === 'grid' ? 'List View' : 'Grid View'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agents Grid/List */}
        {isLoading ? (
          <EmployeeGridSkeleton count={6} viewMode={viewMode} />
        ) : employees.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <h3 className="mb-2 text-2xl font-semibold text-foreground">No AI Agents Found</h3>
              <p className="mb-6 max-w-md text-center text-muted-foreground">
                {searchQuery || selectedCategory !== 'all'
                  ? 'Try adjusting your search or filters to find AI agents.'
                  : 'Our marketplace is currently being populated. AI agents will be available soon.'}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="default"
                  onClick={() => window.location.reload()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  aria-label="Reload page to check for new AI agents"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Check Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  className="border-border hover:bg-accent hover:text-accent-foreground"
                  aria-label="Clear all search filters"
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div
            className={cn(
              'grid gap-6',
              viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1',
            )}
          >
            {employees.map((employee) => (
              <EmployeeCard key={employee.id} employee={employee} viewMode={viewMode} />
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};
