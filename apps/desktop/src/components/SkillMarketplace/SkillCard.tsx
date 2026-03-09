/**
 * SkillCard
 *
 * Renders a single skill in either grid or list view.
 * Supports click-to-expand for full details and an active/inactive toggle.
 */
import {
  BookOpen,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Code2,
  Heart,
  Layers,
  Palette,
  Scale,
  ShoppingBag,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Switch } from '../ui/Switch';
import {
  useSkillMarketplaceStore,
  type MarketplaceSkill,
  type SkillCategory,
  type ViewMode,
} from '../../stores/skillMarketplaceStore';
import { toast } from '../../hooks/useToast';

// ── Category icon map ─────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<Exclude<SkillCategory, 'all'>, ReactNode> = {
  healthcare: <Heart className="h-3.5 w-3.5" />,
  legal: <Scale className="h-3.5 w-3.5" />,
  finance: <Briefcase className="h-3.5 w-3.5" />,
  education: <BookOpen className="h-3.5 w-3.5" />,
  creative: <Palette className="h-3.5 w-3.5" />,
  trades: <Wrench className="h-3.5 w-3.5" />,
  'e-commerce': <ShoppingBag className="h-3.5 w-3.5" />,
  technology: <Code2 className="h-3.5 w-3.5" />,
  productivity: <Layers className="h-3.5 w-3.5" />,
};

const CATEGORY_COLORS: Record<Exclude<SkillCategory, 'all'>, string> = {
  healthcare: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  legal: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  finance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  education: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  creative: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  trades: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'e-commerce': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  technology: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  productivity: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

const SOURCE_LABEL: Record<string, string> = {
  bundled: 'Built-in',
  managed: 'Managed',
  workspace: 'Workspace',
  unknown: 'Unknown',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanizeName(name: string): string {
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function trimDescription(desc: string, maxLen: number): string {
  if (desc.length <= maxLen) return desc;
  return `${desc.slice(0, maxLen).trimEnd()}…`;
}

function categoryLabel(category: SkillCategory): string {
  if (category === 'all') return 'General';
  if (category === 'e-commerce') return 'E-Commerce';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: MarketplaceSkill;
  viewMode: ViewMode;
}

interface InnerProps {
  skill: MarketplaceSkill;
  isExpanded: boolean;
  displayName: string;
  categoryColor: string;
  categoryIcon: ReactNode;
  onExpand: () => void;
  onToggleActive: (e: React.MouseEvent) => void;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SkillCard({ skill, viewMode }: SkillCardProps) {
  const expandedSkillName = useSkillMarketplaceStore((s) => s.expandedSkillName);
  const setExpandedSkill = useSkillMarketplaceStore((s) => s.setExpandedSkill);
  const toggleSkillActive = useSkillMarketplaceStore((s) => s.toggleSkillActive);

  const isExpanded = expandedSkillName === skill.name;
  const displayName = humanizeName(skill.name);
  const categoryIcon = skill.category !== 'all' ? CATEGORY_ICONS[skill.category] : null;
  const categoryColor =
    skill.category !== 'all' ? CATEGORY_COLORS[skill.category] : 'bg-muted text-muted-foreground';

  const handleExpand = () => {
    setExpandedSkill(isExpanded ? null : skill.name);
  };

  const handleToggleActive = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextActive = !skill.isActive;
    toggleSkillActive(skill.name);
    toast({
      title: nextActive ? 'Skill activated' : 'Skill deactivated',
      description: `"${displayName}" is now ${nextActive ? 'active' : 'inactive'}.`,
    });
  };

  const innerProps: InnerProps = {
    skill,
    isExpanded,
    displayName,
    categoryColor,
    categoryIcon,
    onExpand: handleExpand,
    onToggleActive: handleToggleActive,
  };

  if (viewMode === 'list') {
    return <SkillListRow {...innerProps} />;
  }

  return <SkillGridCard {...innerProps} />;
}

// ── Grid card ─────────────────────────────────────────────────────────────────

function SkillGridCard({
  skill,
  isExpanded,
  displayName,
  categoryColor,
  categoryIcon,
  onExpand,
  onToggleActive,
}: InnerProps) {
  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-lg border bg-card text-card-foreground shadow-xs transition-shadow',
        'hover:shadow-sm',
        isExpanded ? 'border-primary ring-1 ring-primary/30' : 'border-border',
      )}
    >
      {/* Card header — click to expand */}
      <button
        className="flex w-full flex-col gap-2 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-t-lg"
        onClick={onExpand}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${displayName}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-tight">{displayName}</span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>

        {/* Category badge */}
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            categoryColor,
          )}
        >
          {categoryIcon}
          {categoryLabel(skill.category)}
        </span>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {trimDescription(skill.description, isExpanded ? 300 : 100)}
        </p>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <SkillDetails skill={skill} />
        </div>
      )}

      {/* Footer — active toggle */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5 mt-auto">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {SOURCE_LABEL[skill.sourceType] ?? skill.sourceType}
        </span>
        <div className="flex items-center gap-2" onClick={onToggleActive}>
          <span className="text-xs text-muted-foreground">
            {skill.isActive ? 'Active' : 'Inactive'}
          </span>
          <Switch
            checked={skill.isActive}
            onCheckedChange={() => {
              /* Handled by the wrapper div's onClick */
            }}
            aria-label={`Toggle ${displayName}`}
            className="scale-90"
          />
        </div>
      </div>
    </article>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────

function SkillListRow({
  skill,
  isExpanded,
  displayName,
  categoryColor,
  categoryIcon,
  onExpand,
  onToggleActive,
}: InnerProps) {
  return (
    <article
      className={cn(
        'flex flex-col rounded-lg border bg-card transition-shadow',
        'hover:shadow-xs',
        isExpanded ? 'border-primary ring-1 ring-primary/30' : 'border-border',
      )}
    >
      <button
        className="flex items-center gap-3 w-full text-left px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-t-lg"
        onClick={onExpand}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${displayName}`}
      >
        {/* Category icon dot */}
        <span
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            categoryColor,
          )}
        >
          {categoryIcon ?? <Layers className="h-3.5 w-3.5" />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{displayName}</span>
            <Badge variant="outline" className="shrink-0 text-[10px] py-0 h-4 px-1.5">
              {SOURCE_LABEL[skill.sourceType] ?? skill.sourceType}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {trimDescription(skill.description, 120)}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Toggle — stopPropagation prevents the expand button from firing */}
          <div className="flex items-center gap-1.5" onClick={onToggleActive}>
            <Switch
              checked={skill.isActive}
              onCheckedChange={() => {
                /* Handled by wrapper div */
              }}
              aria-label={`Toggle ${displayName}`}
              className="scale-90"
            />
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <SkillDetails skill={skill} />
        </div>
      )}
    </article>
  );
}

// ── Shared detail section ────────────────────────────────────────────────────

function SkillDetails({ skill }: { skill: MarketplaceSkill }) {
  return (
    <div className="space-y-2.5 text-xs">
      {skill.allowedTools.length > 0 && (
        <div>
          <p className="font-medium text-muted-foreground mb-1">Allowed Tools</p>
          <div className="flex flex-wrap gap-1">
            {skill.allowedTools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-foreground"
              >
                <Terminal className="h-3 w-3 text-muted-foreground" />
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {skill.requiresBins.length > 0 && (
        <div>
          <p className="font-medium text-muted-foreground mb-1">Requires Binaries</p>
          <div className="flex flex-wrap gap-1">
            {skill.requiresBins.map((bin) => (
              <span
                key={bin}
                className="rounded-md bg-amber-50 px-2 py-0.5 font-mono text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
              >
                {bin}
              </span>
            ))}
          </div>
        </div>
      )}

      {skill.requiresEnv.length > 0 && (
        <div>
          <p className="font-medium text-muted-foreground mb-1">Requires Env Vars</p>
          <div className="flex flex-wrap gap-1">
            {skill.requiresEnv.map((env) => (
              <span
                key={env}
                className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
              >
                {env}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-0.5">
        <div>
          <span className="font-medium text-muted-foreground">Context: </span>
          <span className="text-foreground capitalize">{skill.contextMode}</span>
        </div>
        {skill.supportedOs.length > 0 && (
          <div>
            <span className="font-medium text-muted-foreground">OS: </span>
            <span className="text-foreground">{skill.supportedOs.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
