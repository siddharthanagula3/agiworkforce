'use client';

import { useState, useMemo, useEffect, Suspense, useId } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Search, Settings2, Code, FileText, Sparkles, type LucideIcon } from 'lucide-react';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

// ─── API response type ─────────────────────────────────────────────────────────

interface ApiSkill {
  name: string;
  description: string;
  source: string;
}

// ─── Derived card shape ────────────────────────────────────────────────────────

interface SkillCardItem {
  id: string;
  name: string;
  description: string;
  source: string;
  tags: string[];
  icon: LucideIcon;
  tab: 'prompts' | 'agents';
}

function iconForSkill(_name: string, source: string): LucideIcon {
  if (source === 'builtin') return Sparkles;
  if (source === 'project') return Code;
  return FileText;
}

function tagsForSkill(source: string): string[] {
  if (source === 'builtin') return ['builtin'];
  if (source === 'project') return ['project'];
  if (source === 'user') return ['user'];
  return [];
}

function tabForSkill(source: string): 'prompts' | 'agents' {
  return source === 'builtin' ? 'prompts' : 'agents';
}

function mapApiSkill(s: ApiSkill): SkillCardItem {
  return {
    id: s.name,
    name: s.name,
    description: s.description || '',
    source: s.source,
    tags: tagsForSkill(s.source),
    icon: iconForSkill(s.name, s.source),
    tab: tabForSkill(s.source),
  };
}

// ─── Tab type ──────────────────────────────────────────────────────────────────

type TabValue = 'prompts' | 'agents';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 animate-pulse">
      <div className="mb-2.5 flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.06]" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-white/[0.06]" />
          <div className="h-2.5 w-1/2 rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="h-2.5 w-full rounded bg-white/[0.04]" />
      <div className="mt-1.5 h-2.5 w-4/5 rounded bg-white/[0.04]" />
    </div>
  );
}

// ─── SkillCard ─────────────────────────────────────────────────────────────────

interface SkillCardProps {
  item: SkillCardItem;
}

function SkillCard({ item }: SkillCardProps) {
  const Icon = item.icon;
  return (
    <Link
      href={`/skills/${encodeURIComponent(item.name)}`}
      className="group flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/[0.10] hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="mb-2.5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04]">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
          <p className="font-mono text-[10px] text-muted-foreground/60">{item.source}</p>
        </div>
      </div>
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground/80 line-clamp-2">
        {item.description || 'No description.'}
      </p>
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="border-white/[0.06] px-1.5 py-0 text-[10px] text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </Link>
  );
}

// ─── SkillsPage ────────────────────────────────────────────────────────────────

function SkillsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchId = useId();

  const [searchQuery, setSearchQuery] = useState('');
  const [skills, setSkills] = useState<SkillCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rawTab = searchParams.get('tab');
  const activeTab: TabValue = rawTab === 'agents' ? 'agents' : 'prompts';

  const setActiveTab = (tab: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'prompts') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/skills')
      .then(async (res) => {
        if (!res.ok) throw new Error(`/api/skills returned ${res.status}`);
        const json = (await res.json()) as { skills: ApiSkill[] };
        return json.skills ?? [];
      })
      .then((items) => {
        if (!cancelled) {
          setSkills(items.map(mapApiSkill));
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load skills';
          setError(msg);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const promptSkills = useMemo(() => skills.filter((s) => s.tab === 'prompts'), [skills]);
  const agentSkills = useMemo(() => skills.filter((s) => s.tab === 'agents'), [skills]);

  const filteredItems = useMemo(() => {
    const pool = activeTab === 'prompts' ? promptSkills : agentSkills;
    if (!searchQuery) return pool;
    const q = searchQuery.toLowerCase();
    return pool.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.includes(q)) ||
        s.source.includes(q),
    );
  }, [activeTab, promptSkills, agentSkills, searchQuery]);

  const totalCount = activeTab === 'prompts' ? promptSkills.length : agentSkills.length;

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="min-h-full bg-background" aria-labelledby="skills-title">
          {/* Page Header */}
          <div className="border-b border-white/[0.06] bg-black/20 px-6 py-6">
            <div className="mx-auto max-w-6xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 id="skills-title" className="text-2xl font-bold text-foreground">
                    Skills
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Quick-access prompts and specialist AI agents for every domain.
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="h-8 gap-1.5 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  <Link href="/customize">
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Manage skills
                  </Link>
                </Button>
              </div>

              {/* Tabs + Search */}
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Tabs */}
                <div
                  className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5"
                  role="group"
                  aria-label="Skill category"
                >
                  {(['prompts', 'agents'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-all duration-150',
                        activeTab === tab
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      aria-pressed={activeTab === tab}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <label htmlFor={searchId} className="sr-only">
                    Search skills
                  </label>
                  <Search
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id={searchId}
                    name="skills-search"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={`Search ${activeTab}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 border-white/[0.08] bg-white/[0.04] pl-9 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto max-w-6xl px-6 py-6">
            {loading ? (
              <>
                <div className="mb-4 h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              </>
            ) : error ? (
              <div className="py-20 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                  <FileText className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-medium text-foreground">Could not load skills</h3>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
            ) : (
              <>
                {/* Results count */}
                <p className="mb-4 text-xs text-muted-foreground">
                  {searchQuery
                    ? `${filteredItems.length} of ${totalCount} ${activeTab}`
                    : `${totalCount} ${activeTab}`}
                </p>

                {/* Grid */}
                {filteredItems.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredItems.map((item) => (
                      <SkillCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                      <Search className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium text-foreground">No {activeTab} found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {totalCount === 0
                        ? 'No skills are loaded in this environment. Use Manage skills to connect project or local skill sources.'
                        : 'Try a different search term.'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsPageInner />
    </Suspense>
  );
}
