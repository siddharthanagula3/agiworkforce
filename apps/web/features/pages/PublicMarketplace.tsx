/**
 * AI Agent Marketplace - Modern GPT Store / VS Code Marketplace Design
 * Browse and add AI agents to your chat
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Badge } from '@shared/ui/badge';
import {
  Search,
  CheckCircle,
  Star,
  MessageSquare,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { categories, type AIEmployee } from '@/data/marketplace-employees';
import { toast } from 'sonner';
import { useAuthStore } from '@shared/stores/authentication-store';
import { supabase } from '@shared/lib/supabase-client';
import { useQuery } from '@tanstack/react-query';
import {
  isEmployeePurchased,
  listPurchasedEmployees,
  purchaseEmployee,
} from '@features/workforce/services/employee-database';
import { motion, AnimatePresence } from 'framer-motion';

/** Generate a pseudo-random rating between 4.0 and 5.0 from an ID string */
function deriveRating(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return 4.0 + (Math.abs(hash) % 10) / 10;
}

/** Generate a pseudo-random usage count from an ID string */
function deriveUsageCount(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 37 + id.charCodeAt(i)) | 0;
  }
  const count = 200 + (Math.abs(hash) % 4800);
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
}

/** Render star rating */
function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < full
              ? 'fill-yellow-500 text-yellow-500'
              : i === full && hasHalf
                ? 'fill-yellow-500/50 text-yellow-500'
                : 'text-muted-foreground/30',
          )}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </span>
  );
}

export const MarketplacePublicPage: React.FC = () => {
  const router = useRouter();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [purchasedEmployees, setPurchasedEmployees] = useState<Set<string>>(new Set());
  const featuredScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadPurchased() {
      try {
        if (!user?.id) {
          setPurchasedEmployees(new Set());
          return;
        }
        const rows = await listPurchasedEmployees(user.id);
        if (!isMounted) return;
        setPurchasedEmployees(new Set(rows.map((r) => r.employee_id)));
      } catch (err) {
        console.warn('Failed to load purchases:', err);
      }
    }
    loadPurchased();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Fetch employees from database
  const { data: dbEmployees = [], isLoading: isLoadingEmployees } = useQuery<AIEmployee[]>({
    queryKey: ['public-marketplace-employees', selectedCategory, searchQuery],
    queryFn: async () => {
      let query = (supabase.from('ai_employees') as ReturnType<typeof supabase.from>)
        .select('*')
        .eq('status', 'active');

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory);
      }

      if (searchQuery) {
        const searchTerm = searchQuery.toLowerCase();
        query = query.or(
          `name.ilike.%${searchTerm}%,role.ilike.%${searchTerm}%,department.ilike.%${searchTerm}%`,
        );
      }

      const { data, error } = await query;

      if (error) {
        toast.error('Failed to load agents');
        return [];
      }

      return (data || []).map((dbEmp: Record<string, unknown>): AIEmployee => {
        return {
          id: (dbEmp['employee_id'] || dbEmp['id']) as string,
          name: dbEmp['name'] as string,
          role: dbEmp['role'] as string,
          category: (dbEmp['category'] as string) || 'general',
          description:
            (dbEmp['system_prompt'] as string | undefined)?.slice(0, 150) ||
            `Expert ${dbEmp['role'] as string}`,
          provider: 'claude' as const,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${dbEmp['employee_id'] as string}&backgroundColor=EEF2FF%2CE0F2FE%2CF0F9FF&radius=50&size=128`,
          skills: Array.isArray(dbEmp['capabilities']) ? (dbEmp['capabilities'] as string[]) : [],
          specialty: (dbEmp['department'] as string) || (dbEmp['category'] as string) || 'General',
          fitLevel: 'excellent' as const,
          popular: dbEmp['level'] === 'senior',
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  // Pick featured agents: popular ones first, then first few
  const featuredAgents = useMemo(() => {
    const popular = dbEmployees.filter((e) => e.popular);
    const rest = dbEmployees.filter((e) => !e.popular);
    return [...popular, ...rest].slice(0, 6);
  }, [dbEmployees]);

  const handlePurchase = async (employee: AIEmployee) => {
    try {
      if (!user?.id) {
        toast.error('Please sign in to add this agent');
        router.push('/auth/login');
        return;
      }

      const already = await isEmployeePurchased(user.id, employee.id);
      if (already) {
        toast.info('Already added');
        return;
      }

      toast.loading('Adding agent...', { id: 'hire' });

      await purchaseEmployee(user.id, employee);
      const rows = await listPurchasedEmployees(user.id);
      setPurchasedEmployees(new Set(rows.map((r) => r.employee_id)));

      toast.success(`${employee.name} added!`, {
        id: 'hire',
        description: `Start chatting with your new ${employee.role}.`,
        action: {
          label: 'Go to Chat',
          onClick: () => router.push('/chat'),
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('DATABASE_SETUP_REQUIRED')) {
        toast.error('Database Setup Required', {
          description: 'Please run the database setup script in Supabase.',
          action: {
            label: 'View Setup Guide',
            onClick: () => window.open('/setup-guide', '_blank'),
          },
        });
      } else {
        toast.error('Failed to add agent', {
          description: 'Please try again or contact support.',
        });
      }
      toast.dismiss('hire');
    }
  };

  const isPurchased = (employeeId: string) => purchasedEmployees.has(employeeId);

  const scrollFeatured = (direction: 'left' | 'right') => {
    if (!featuredScrollRef.current) return;
    const scrollAmount = 320;
    featuredScrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // Category pills for the hero area
  const categoryPills = useMemo(() => {
    return categories.map((cat) => ({
      id: cat.id,
      label: cat.id === 'all' ? 'All' : cat.label,
    }));
  }, []);

  return (
    <div className="min-h-screen w-full max-w-7xl mx-auto px-4 pt-24 pb-16 sm:px-6 lg:px-8">
      {/* Hero: Search + Category Pills */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl mb-2">Agent Marketplace</h1>
          <p className="text-muted-foreground text-lg">
            {isLoadingEmployees
              ? 'Loading...'
              : `${dbEmployees.length} specialized AI agents ready to work`}
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search AI agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-12 pr-10 text-base rounded-xl border-border bg-card"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {categoryPills.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                selectedCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Featured Agents Section */}
      {featuredAgents.length > 0 && selectedCategory === 'all' && !searchQuery && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Featured Agents</h2>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => scrollFeatured('left')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => scrollFeatured('right')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div
            ref={featuredScrollRef}
            className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
          >
            {featuredAgents.map((agent) => {
              const rating = deriveRating(agent.id);
              const uses = deriveUsageCount(agent.id);
              return (
                <Card
                  key={agent.id}
                  className={cn(
                    'min-w-[280px] max-w-[320px] snap-start flex-shrink-0 rounded-xl border border-border bg-card transition-colors hover:border-primary/50',
                    isPurchased(agent.id) && 'border-primary/30',
                  )}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                        <NextImage
                          src={agent.avatar}
                          alt={agent.name}
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold truncate">{agent.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">{agent.specialty}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {agent.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <StarRating rating={rating} />
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {uses}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Loading Skeleton */}
      {isLoadingEmployees && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="rounded-xl border border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-xl bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                </div>
                <div className="flex gap-1 mb-3">
                  <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                  <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                </div>
                <div className="h-8 w-full rounded-lg bg-muted animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results Count */}
      {!isLoadingEmployees && dbEmployees.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {selectedCategory !== 'all' || searchQuery ? (
              <>
                {dbEmployees.length} {dbEmployees.length === 1 ? 'agent' : 'agents'}
                {selectedCategory !== 'all' &&
                  ` in ${categories.find((c) => c.id === selectedCategory)?.label ?? selectedCategory}`}
                {searchQuery && ` matching "${searchQuery}"`}
              </>
            ) : (
              'All Agents'
            )}
          </h2>
          {(searchQuery || selectedCategory !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Agent Grid */}
      {!isLoadingEmployees && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {dbEmployees.map((agent, index) => {
              const rating = deriveRating(agent.id);
              const uses = deriveUsageCount(agent.id);
              const purchased = isPurchased(agent.id);

              return (
                <motion.div
                  key={agent.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                >
                  <Card
                    className={cn(
                      'rounded-xl border border-border bg-card transition-colors hover:border-primary/50',
                      purchased && 'border-primary/30',
                    )}
                  >
                    <CardContent className="flex flex-col h-full p-4">
                      {/* Avatar + Name */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                          <NextImage
                            src={agent.avatar}
                            alt={agent.name}
                            width={44}
                            height={44}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                          <p className="text-xs text-muted-foreground truncate">
                            {agent.role}{' '}
                            {agent.specialty !== agent.role ? `/ ${agent.specialty}` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-grow">
                        {agent.description}
                      </p>

                      {/* Skill Tags */}
                      {agent.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {agent.skills.slice(0, 3).map((skill) => (
                            <Badge
                              key={skill}
                              variant="secondary"
                              className="text-[11px] px-2 py-0 font-normal"
                            >
                              {skill}
                            </Badge>
                          ))}
                          {agent.skills.length > 3 && (
                            <Badge variant="outline" className="text-[11px] px-2 py-0 font-normal">
                              +{agent.skills.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Rating + Uses + Button */}
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <StarRating rating={rating} />
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {uses}
                          </span>
                        </div>
                        <Button
                          onClick={() => (purchased ? router.push('/chat') : handlePurchase(agent))}
                          size="sm"
                          variant={purchased ? 'outline' : 'default'}
                          className={cn(
                            'h-8 text-xs',
                            !purchased && 'bg-primary text-primary-foreground hover:bg-primary/90',
                          )}
                        >
                          {purchased ? (
                            <>
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Chat
                            </>
                          ) : (
                            <>
                              <MessageSquare className="mr-1 h-3 w-3" />
                              Add to Chat
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Empty State */}
      {!isLoadingEmployees && dbEmployees.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">No agents found</h3>
            <p className="mb-6 max-w-md text-muted-foreground">
              Try adjusting your search or category filter.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

const MarketplacePublicPageWithErrorBoundary: React.FC = () => (
  <ErrorBoundary componentName="MarketplacePublicPage" showReportDialog>
    <MarketplacePublicPage />
  </ErrorBoundary>
);

export default MarketplacePublicPageWithErrorBoundary;
