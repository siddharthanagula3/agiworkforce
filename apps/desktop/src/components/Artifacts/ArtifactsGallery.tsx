/**
 * ArtifactsGallery Component
 *
 * Gallery-style browser for all created artifacts. Provides:
 * - "Your Artifacts" tab backed by the artifact store
 * - "Inspiration" tab with hardcoded example templates
 * - Category filter row
 * - Search bar
 * - 3-column card grid with hover actions
 */

import { formatDistanceToNow } from 'date-fns';
import { Copy, Layers, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { useArtifactStore, type ArtifactSummary, type ArtifactType } from '@/stores/artifactStore';
import { ArtifactTypeIcon } from '@/lib/artifactUtils';
import { ArtifactCategoryFilter, type ArtifactCategory } from './ArtifactCategoryFilter';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types
// =============================================================================

type GalleryTab = 'yours' | 'inspiration';

interface InspirationItem {
  id: string;
  title: string;
  artifact_type: ArtifactType;
  description: string;
  tags: string[];
}

// =============================================================================
// Inspiration data (hardcoded examples)
// =============================================================================

const INSPIRATION_ITEMS: InspirationItem[] = [
  {
    id: 'insp-react-dashboard',
    title: 'React Dashboard',
    artifact_type: 'web',
    description: 'Responsive analytics dashboard with charts, KPI cards, and a data table.',
    tags: ['react', 'dashboard', 'analytics'],
  },
  {
    id: 'insp-data-analysis',
    title: 'Data Analysis Report',
    artifact_type: 'document',
    description:
      'Structured markdown report with executive summary, findings, and recommendations.',
    tags: ['report', 'analysis', 'markdown'],
  },
  {
    id: 'insp-api-docs',
    title: 'API Documentation',
    artifact_type: 'document',
    description:
      'Auto-generated REST API docs with endpoint tables, request/response schemas, and examples.',
    tags: ['api', 'docs', 'openapi'],
  },
  {
    id: 'insp-svg-logo',
    title: 'SVG Logo Design',
    artifact_type: 'web',
    description: 'Scalable vector logo with layered paths, gradients, and responsive viewBox.',
    tags: ['svg', 'design', 'logo'],
  },
  {
    id: 'insp-python-etl',
    title: 'Python ETL Script',
    artifact_type: 'code',
    description: 'Extract-transform-load pipeline with pandas, type hints, and error handling.',
    tags: ['python', 'etl', 'data'],
  },
  {
    id: 'insp-er-diagram',
    title: 'Entity Relationship Diagram',
    artifact_type: 'diagram',
    description: 'Mermaid ER diagram showing database schema with relations and cardinality.',
    tags: ['diagram', 'database', 'schema'],
  },
  {
    id: 'insp-csv-sales',
    title: 'Sales Data Spreadsheet',
    artifact_type: 'spreadsheet',
    description: 'Monthly sales data with formulas for totals, averages, and variance tracking.',
    tags: ['spreadsheet', 'sales', 'data'],
  },
  {
    id: 'insp-typescript-sdk',
    title: 'TypeScript SDK Boilerplate',
    artifact_type: 'code',
    description: 'Typed API client with retry logic, rate limiting, and full JSDoc coverage.',
    tags: ['typescript', 'sdk', 'api'],
  },
  {
    id: 'insp-css-landing',
    title: 'CSS Landing Page',
    artifact_type: 'web',
    description: 'Modern hero section with gradient text, CTA button, and responsive layout.',
    tags: ['html', 'css', 'landing'],
  },
];

// =============================================================================
// Category → ArtifactType mapping
// =============================================================================

function categoryMatchesType(category: ArtifactCategory, type: ArtifactType): boolean {
  switch (category) {
    case 'all':
      return true;
    case 'code':
      return type === 'code';
    case 'documents':
      return type === 'document' || type === 'presentation';
    case 'diagrams':
      return type === 'diagram';
    case 'web':
      return type === 'web';
    case 'data':
      return type === 'spreadsheet' || type === 'chart';
    case 'other':
      return type === 'image';
    default:
      return true;
  }
}

// =============================================================================
// Type badge color
// =============================================================================

function getTypeBadgeClass(type: ArtifactType): string {
  switch (type) {
    case 'code':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    case 'document':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    case 'diagram':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/20';
    case 'web':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
    case 'spreadsheet':
    case 'chart':
      return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20';
    case 'presentation':
      return 'bg-pink-500/15 text-pink-400 border-pink-500/20';
    case 'image':
      return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20';
    default:
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20';
  }
}

// =============================================================================
// Artifact card — "Your Artifacts" tab
// =============================================================================

interface ArtifactCardProps {
  summary: ArtifactSummary;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function ArtifactCard({ summary, onOpen, onDelete, onDuplicate }: ArtifactCardProps) {
  const [hovered, setHovered] = useState(false);

  const formattedDate = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(summary.created_at), { addSuffix: true });
    } catch {
      return 'unknown date';
    }
  }, [summary.created_at]);

  const sizeLabel = useMemo(() => {
    if (summary.size_bytes < 1024) return `${summary.size_bytes} B`;
    return `${(summary.size_bytes / 1024).toFixed(1)} KB`;
  }, [summary.size_bytes]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open artifact: ${summary.title}`}
      className="relative group rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20 transition-all duration-150 overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(summary.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(summary.id);
        }
      }}
    >
      {/* Preview area */}
      <div className="h-32 flex items-center justify-center bg-white/3 border-b border-white/5">
        <ArtifactTypeIcon type={summary.artifact_type} className="h-10 w-10 text-white/20" />
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="text-sm font-medium text-white leading-tight truncate"
            title={summary.title}
          >
            {summary.title}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
              getTypeBadgeClass(summary.artifact_type),
            )}
          >
            <ArtifactTypeIcon type={summary.artifact_type} className="h-2.5 w-2.5" />
            {summary.artifact_type}
          </span>
          {summary.version_count > 1 && (
            <span className="text-[10px] text-white/40">v{summary.current_version}</span>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/35">
          <span>{formattedDate}</span>
          <span>{sizeLabel}</span>
        </div>
      </div>

      {/* Hover action overlay */}
      {hovered && (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(summary.id);
            }}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
          >
            Open
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(summary.id);
            }}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(summary.id);
            }}
            className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Inspiration card
// =============================================================================

interface InspirationCardProps {
  item: InspirationItem;
}

function InspirationCard({ item }: InspirationCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20 transition-all duration-150 overflow-hidden">
      {/* Preview area */}
      <div className="h-32 flex items-center justify-center bg-white/3 border-b border-white/5">
        <ArtifactTypeIcon type={item.artifact_type} className="h-10 w-10 text-white/20" />
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        <h3 className="text-sm font-medium text-white leading-tight">{item.title}</h3>
        <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">{item.description}</p>

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
              getTypeBadgeClass(item.artifact_type),
            )}
          >
            <ArtifactTypeIcon type={item.artifact_type} className="h-2.5 w-2.5" />
            {item.artifact_type}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span key={tag} className="text-[10px] text-white/35 bg-white/5 px-1.5 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Empty state
// =============================================================================

function ArtifactsEmptyState({ query }: { query: string }) {
  if (query) {
    return (
      <div className="col-span-3">
        <EmptyState
          icon={Search}
          title={`No artifacts match "${query}"`}
          description="Try adjusting your search or category filter"
        />
      </div>
    );
  }

  return (
    <div className="col-span-3">
      <EmptyState
        icon={Layers}
        title="No artifacts yet"
        description="Ask the AI to create code, documents, diagrams, or images and they will appear here."
      />
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

interface ArtifactsGalleryProps {
  className?: string;
}

export function ArtifactsGallery({ className }: ArtifactsGalleryProps) {
  const {
    summaries,
    listArtifacts,
    deleteArtifact,
    setActiveArtifact,
    openPanel,
    getArtifact,
    createArtifact,
  } = useArtifactStore(
    useShallow((s) => ({
      summaries: s.summaries,
      listArtifacts: s.listArtifacts,
      deleteArtifact: s.deleteArtifact,
      setActiveArtifact: s.setActiveArtifact,
      openPanel: s.openPanel,
      getArtifact: s.getArtifact,
      createArtifact: s.createArtifact,
    })),
  );

  const [activeTab, setActiveTab] = useState<GalleryTab>('yours');
  const [category, setCategory] = useState<ArtifactCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load artifacts on mount
  useEffect(() => {
    setIsLoading(true);
    listArtifacts({ statuses: ['complete', 'archived'] })
      .catch((err: unknown) => {
        console.error('Failed to load artifacts:', err);
        toast.error('Failed to load artifacts');
      })
      .finally(() => setIsLoading(false));
  }, [listArtifacts]);

  // Filter summaries by category + search
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      const matchesCategory = categoryMatchesType(category, s.artifact_type);
      const matchesSearch =
        !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [summaries, category, searchQuery]);

  // Filter inspiration items by category + search
  const filteredInspiration = useMemo(() => {
    return INSPIRATION_ITEMS.filter((item) => {
      const matchesCategory = categoryMatchesType(category, item.artifact_type);
      const matchesSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((t) => t.includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [category, searchQuery]);

  const handleOpen = useCallback(
    (id: string) => {
      setActiveArtifact(id);
      openPanel();
    },
    [setActiveArtifact, openPanel],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const success = await deleteArtifact(id);
        if (success) {
          toast.success('Artifact deleted');
        } else {
          toast.error('Failed to delete artifact');
        }
      } catch (err: unknown) {
        console.error('Error deleting artifact:', err);
        toast.error('Failed to delete artifact');
      }
    },
    [deleteArtifact],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const artifact = await getArtifact(id);
        if (!artifact) {
          toast.error('Artifact not found');
          return;
        }
        const copy = await createArtifact(
          `${artifact.title} (copy)`,
          artifact.artifact_type,
          artifact.content,
          artifact.metadata,
          artifact.conversation_id,
          undefined,
          artifact.tags,
        );
        if (copy) {
          toast.success('Artifact duplicated');
          await listArtifacts({ statuses: ['complete', 'archived'] });
        } else {
          toast.error('Failed to duplicate artifact');
        }
      } catch (err: unknown) {
        console.error('Error duplicating artifact:', err);
        toast.error('Failed to duplicate artifact');
      }
    },
    [getArtifact, createArtifact, listArtifacts],
  );

  return (
    <div className={cn('flex flex-col h-full bg-zinc-900', className)}>
      {/* Header */}
      <div className="px-6 pt-6 pb-0 shrink-0">
        <h1 className="text-xl font-semibold text-white mb-4">Artifacts</h1>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('yours')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'yours'
                ? 'border-white text-white'
                : 'border-transparent text-white/50 hover:text-white/75',
            )}
          >
            Your Artifacts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inspiration')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'inspiration'
                ? 'border-white text-white'
                : 'border-transparent text-white/50 hover:text-white/75',
            )}
          >
            Inspiration
          </button>
        </div>
      </div>

      {/* Search + category filters */}
      <div className="shrink-0">
        <div className="px-6 pt-4 pb-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
            <input
              type="text"
              placeholder="Search artifacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus:ring-0 transition-colors"
            />
          </div>
        </div>

        <ArtifactCategoryFilter selected={category} onChange={setCategory} />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="animate-pulse rounded-xl border border-white/10 bg-white/5"
              >
                <div className="h-32 bg-white/10 rounded-t-xl" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-24 rounded bg-white/10" />
                  <div className="h-3 w-full rounded bg-white/10" />
                  <div className="h-3 w-16 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'yours' ? (
          <div className="grid grid-cols-3 gap-4 pt-4">
            {filteredSummaries.length === 0 ? (
              <ArtifactsEmptyState query={searchQuery} />
            ) : (
              filteredSummaries.map((summary) => (
                <ArtifactCard
                  key={summary.id}
                  summary={summary}
                  onOpen={handleOpen}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 pt-4">
            {filteredInspiration.length === 0 ? (
              <ArtifactsEmptyState query={searchQuery} />
            ) : (
              filteredInspiration.map((item) => <InspirationCard key={item.id} item={item} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
