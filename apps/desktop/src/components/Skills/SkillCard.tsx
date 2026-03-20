import { memo, useCallback, useState } from 'react';
import {
  BarChart2,
  BookOpen,
  Bug,
  Check,
  ClipboardList,
  Code2,
  DollarSign,
  FileText,
  Headphones,
  Mail,
  MoreVertical,
  PenLine,
  Phone,
  Search,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { cn } from '../../lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useSkillsStore } from '../../stores/skillsStore';
import type { Skill } from '../../stores/skillsStore';

// ── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  TrendingUp,
  BarChart2,
  FileText,
  Headphones,
  Phone,
  Code2,
  Bug,
  Zap,
  PenLine,
  Search,
  DollarSign,
  ClipboardList,
  Mail,
  BookOpen,
};

// ── Category badge colors ─────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  coding: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  marketing: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  legal: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  sales: 'bg-green-500/15 text-green-400 border-green-500/20',
  research: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  writing: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  finance: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  support: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: Skill;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SkillCard = memo(function SkillCard({ skill }: SkillCardProps) {
  const { installSkill, uninstallSkill } = useSkillsStore(
    useShallow((s) => ({
      installSkill: s.installSkill,
      uninstallSkill: s.uninstallSkill,
    })),
  );

  const [menuOpen, setMenuOpen] = useState(false);

  const IconComponent = ICON_MAP[skill.icon] ?? Sparkles;

  const handleInstallToggle = useCallback(() => {
    if (skill.isInstalled) {
      uninstallSkill(skill.id);
      toast.success(`Uninstalled "${skill.name}"`);
    } else {
      installSkill(skill.id);
      toast.success(`Installed "${skill.name}"`);
    }
  }, [skill.id, skill.isInstalled, skill.name, installSkill, uninstallSkill]);

  const handleEdit = useCallback(() => {
    setMenuOpen(false);
    toast.info(`Edit "${skill.name}" — coming soon`);
  }, [skill.name]);

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    uninstallSkill(skill.id);
    toast.success(`Removed "${skill.name}"`);
  }, [skill.id, skill.name, uninstallSkill]);

  const handleDuplicate = useCallback(() => {
    setMenuOpen(false);
    toast.info(`Duplicate "${skill.name}" — coming soon`);
  }, [skill.name]);

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-xl border border-white/5 bg-card p-4',
        'transition-all duration-200 hover:border-white/10 hover:bg-card/80 hover:shadow-lg',
      )}
    >
      {/* Installed indicator strip */}
      {skill.isInstalled && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-green-500/60 via-emerald-500/60 to-green-500/60" />
      )}

      {/* Header row: icon + name + three-dot menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {/* Icon bubble */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <IconComponent className="h-4 w-4 text-primary" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold leading-tight text-foreground">
                {skill.name}
              </span>
              {skill.isInstalled && (
                <Check className="h-3.5 w-3.5 shrink-0 text-green-500" aria-label="Installed" />
              )}
            </div>
            <span className="text-xs text-muted-foreground">{skill.author}</span>
          </div>
        </div>

        {/* Three-dot menu */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                'opacity-0 transition-opacity group-hover:opacity-100',
                'hover:bg-accent hover:text-foreground focus-visible:opacity-100',
                menuOpen && 'opacity-100',
              )}
              aria-label="Skill options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-36 p-1">
            <button
              onClick={handleEdit}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Edit
            </button>
            <button
              onClick={handleDuplicate}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Duplicate
            </button>
            <button
              onClick={handleDelete}
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              Delete
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Description */}
      <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
        {skill.description}
      </p>

      {/* Footer row: category badge + usage + install button */}
      <div className="flex items-center justify-between gap-2">
        <Badge
          className={cn(
            'border text-xs font-medium',
            CATEGORY_COLORS[skill.category] ?? 'bg-secondary text-secondary-foreground',
          )}
        >
          {skill.category.charAt(0).toUpperCase() + skill.category.slice(1)}
        </Badge>

        <div className="flex items-center gap-2">
          {skill.usageCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {skill.usageCount.toLocaleString()} uses
            </span>
          )}
          <Button
            size="xs"
            variant={skill.isInstalled ? 'outline' : 'default'}
            onClick={handleInstallToggle}
            className="h-7 shrink-0 px-2.5 text-xs"
          >
            {skill.isInstalled ? 'Uninstall' : 'Install'}
          </Button>
        </div>
      </div>
    </div>
  );
});
