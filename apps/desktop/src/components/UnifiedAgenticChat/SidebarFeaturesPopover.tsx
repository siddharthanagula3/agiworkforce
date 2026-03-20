/**
 * SidebarFeaturesPopover
 *
 * Collapses sidebar nav items into a categorized 2-column popover grid.
 * The 4 most-used items (Research, Terminal, Canvas, MCP Tools) are promoted
 * to direct links in the sidebar — they are intentionally absent here.
 */
import {
  Calendar,
  Clock,
  Cloud,
  Database,
  Eye,
  FileText,
  GitBranch,
  HelpCircle,
  History,
  Image,
  Layers,
  Monitor,
  MoreHorizontal,
  Package,
  PieChart,
  Play,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Telescope,
  TrendingUp,
  Users,
  Wand2,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/Popover';
import { Button } from '../ui/Button';
import type { ActiveView } from '../../stores/chat/types';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  /** If set, calls setActiveView with this value */
  view?: ActiveView;
  /** If set, calls the matching callback instead of setActiveView */
  action?: string;
  /** Only shown when this condition is truthy (default: true) */
  visible?: boolean;
}

interface NavCategory {
  label: string;
  items: NavItem[];
}

interface SidebarFeaturesPopoverProps {
  className?: string;
  activeView: ActiveView;
  artifactPanelOpen: boolean;
  canAccessMediaLab: boolean;
  onSetActiveView: (view: ActiveView) => void;
  onOpenResearch?: () => void;
  onOpenRewind?: () => void;
  onOpenCollaboration?: () => void;
  onToggleMediaLab?: () => void;
  onToggleArtifacts?: () => void;
  onOpenMcpWorkspace?: () => void;
  onOpenMcpBundles?: () => void;
  /** Controlled open state — when provided, the popover is externally controlled */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * When true, renders the trigger as a full-width sidebar row (icon + "More" label)
   * instead of the default icon-only button.
   */
  triggerAsRow?: boolean;
}

function buildNavCategories(props: SidebarFeaturesPopoverProps): NavCategory[] {
  return [
    {
      label: 'AI & Agents',
      items: [
        {
          id: 'rewind',
          label: 'Rewind Timeline',
          icon: History,
          iconBg: 'bg-violet-400/20',
          iconColor: 'text-violet-400',
          action: 'rewind',
        },
        {
          id: 'collaboration',
          label: 'Agent Swarm',
          icon: Users,
          iconBg: 'bg-purple-400/20',
          iconColor: 'text-purple-400',
          action: 'collaboration',
        },
        {
          id: 'computer-use',
          label: 'Computer Use',
          icon: Monitor,
          iconBg: 'bg-teal-400/20',
          iconColor: 'text-teal-400',
          view: 'computer-use',
        },
        {
          id: 'automation',
          label: 'Automation',
          icon: Play,
          iconBg: 'bg-green-400/20',
          iconColor: 'text-green-400',
          view: 'automation',
        },
        {
          id: 'vision',
          label: 'Vision',
          icon: Eye,
          iconBg: 'bg-purple-400/20',
          iconColor: 'text-purple-400',
          view: 'vision',
        },
        {
          id: 'skills',
          label: 'Skills',
          icon: Sparkles,
          iconBg: 'bg-pink-400/20',
          iconColor: 'text-pink-400',
          view: 'skills',
        },
      ],
    },
    {
      label: 'Productivity',
      items: [
        {
          id: 'projects',
          label: 'Projects',
          icon: Layers,
          iconBg: 'bg-teal-400/20',
          iconColor: 'text-teal-400',
          view: 'projects',
        },
        {
          id: 'tasks',
          label: 'Tasks',
          icon: Zap,
          iconBg: 'bg-orange-400/20',
          iconColor: 'text-orange-400',
          view: 'tasks',
        },
        {
          id: 'artifacts',
          label: 'Artifacts',
          icon: FileText,
          iconBg: 'bg-orange-400/20',
          iconColor: 'text-orange-400',
          action: 'artifacts',
        },
        {
          id: 'images',
          label: 'Images',
          icon: Image,
          iconBg: 'bg-pink-400/20',
          iconColor: 'text-pink-400',
          view: 'images',
        },
        {
          id: 'schedules',
          label: 'Schedules',
          icon: Clock,
          iconBg: 'bg-violet-400/20',
          iconColor: 'text-violet-400',
          view: 'schedules',
        },
        {
          id: 'artifacts-gallery',
          label: 'Artifacts Gallery',
          icon: Layers,
          iconBg: 'bg-cyan-400/20',
          iconColor: 'text-cyan-400',
          view: 'artifacts-gallery',
        },
        {
          id: 'deep-research',
          label: 'Deep Research',
          icon: Telescope,
          iconBg: 'bg-indigo-400/20',
          iconColor: 'text-indigo-400',
          view: 'deep-research',
        },
        {
          id: 'calendar',
          label: 'Calendar',
          icon: Calendar,
          iconBg: 'bg-emerald-400/20',
          iconColor: 'text-emerald-400',
          view: 'calendar',
        },
        {
          id: 'documents',
          label: 'Documents',
          icon: FileText,
          iconBg: 'bg-rose-400/20',
          iconColor: 'text-rose-400',
          view: 'documents',
        },
        {
          id: 'workflows',
          label: 'Workflows',
          icon: Workflow,
          iconBg: 'bg-sky-400/20',
          iconColor: 'text-sky-400',
          view: 'workflows',
        },
        {
          id: 'medialab',
          label: 'Media Lab Pro+',
          icon: Wand2,
          iconBg: 'bg-amber-400/20',
          iconColor: 'text-amber-400',
          action: 'medialab',
          visible: props.canAccessMediaLab,
        },
      ],
    },
    {
      label: 'Development',
      items: [
        {
          id: 'git',
          label: 'Git',
          icon: GitBranch,
          iconBg: 'bg-orange-400/20',
          iconColor: 'text-orange-400',
          view: 'git',
        },
        {
          id: 'tool-registry',
          label: 'Tool Registry',
          icon: Package,
          iconBg: 'bg-rose-400/20',
          iconColor: 'text-rose-400',
          action: 'mcp-bundles',
        },
      ],
    },
    {
      label: 'Data & Storage',
      items: [
        {
          id: 'database',
          label: 'Database',
          icon: Database,
          iconBg: 'bg-cyan-400/20',
          iconColor: 'text-cyan-400',
          view: 'database',
        },
        {
          id: 'cloud',
          label: 'Cloud Storage',
          icon: Cloud,
          iconBg: 'bg-sky-400/20',
          iconColor: 'text-sky-400',
          view: 'cloud',
        },
      ],
    },
    {
      label: 'Analytics & Admin',
      items: [
        {
          id: 'analytics',
          label: 'Analytics',
          icon: PieChart,
          iconBg: 'bg-cyan-400/20',
          iconColor: 'text-cyan-400',
          view: 'analytics',
        },
        {
          id: 'roi',
          label: 'ROI Dashboard',
          icon: TrendingUp,
          iconBg: 'bg-emerald-400/20',
          iconColor: 'text-emerald-400',
          view: 'roi',
        },
        {
          id: 'governance',
          label: 'Governance',
          icon: Shield,
          iconBg: 'bg-red-400/20',
          iconColor: 'text-red-400',
          view: 'governance',
        },
        {
          id: 'teams',
          label: 'Teams',
          icon: Users,
          iconBg: 'bg-indigo-400/20',
          iconColor: 'text-indigo-400',
          view: 'teams',
        },
        {
          id: 'marketplace',
          label: 'Marketplace',
          icon: ShoppingBag,
          iconBg: 'bg-green-400/20',
          iconColor: 'text-green-400',
          view: 'marketplace',
        },
        {
          id: 'mobile',
          label: 'Mobile Companion',
          icon: Smartphone,
          iconBg: 'bg-violet-400/20',
          iconColor: 'text-violet-400',
          view: 'mobile',
        },
        {
          id: 'help',
          label: 'Help',
          icon: HelpCircle,
          iconBg: 'bg-[hsl(var(--muted))]',
          iconColor: 'text-[hsl(var(--muted-foreground))]',
          view: 'help',
        },
      ],
    },
  ];
}

export function SidebarFeaturesPopover(props: SidebarFeaturesPopoverProps) {
  const {
    className,
    activeView,
    artifactPanelOpen,
    onSetActiveView,
    onOpenResearch,
    onOpenRewind,
    onOpenCollaboration,
    onToggleMediaLab,
    onToggleArtifacts,
    onOpenMcpWorkspace,
    onOpenMcpBundles,
    open,
    onOpenChange,
    triggerAsRow = false,
  } = props;

  const categories = buildNavCategories(props);

  const handleItemClick = (item: NavItem) => {
    if (item.view) {
      onSetActiveView(item.view);
      return;
    }
    switch (item.action) {
      case 'research':
        onOpenResearch?.();
        break;
      case 'rewind':
        onOpenRewind?.();
        break;
      case 'collaboration':
        onOpenCollaboration?.();
        break;
      case 'artifacts':
        onToggleArtifacts?.();
        break;
      case 'medialab':
        onToggleMediaLab?.();
        break;
      case 'mcp-workspace':
        onOpenMcpWorkspace?.();
        break;
      case 'mcp-bundles':
        onOpenMcpBundles?.();
        break;
    }
  };

  const isItemActive = (item: NavItem): boolean => {
    if (item.view) return activeView === item.view;
    if (item.action === 'artifacts') return artifactPanelOpen;
    return false;
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {triggerAsRow ? (
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden',
              'text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-[hsl(var(--foreground))]',
              className,
            )}
          >
            <MoreHorizontal className="h-4 w-4 shrink-0" />
            <span>More</span>
          </button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              className,
            )}
            title="More features"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[420px] max-h-[70vh] overflow-y-auto p-0 bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-xl rounded-xl"
      >
        <div className="p-3 space-y-3">
          {categories.map((category) => {
            const visibleItems = category.items.filter(
              (item) => item.visible === undefined || item.visible,
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={category.label}>
                <div className="px-2 mb-1.5 text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                  {category.label}
                </div>
                <div className="grid grid-cols-2 gap-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isItemActive(item);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-lg transition-colors',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-hidden',
                          active
                            ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
                            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]',
                        )}
                      >
                        <span
                          className={cn(
                            'w-5 h-5 flex items-center justify-center rounded shrink-0',
                            item.iconBg,
                            item.iconColor,
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate text-xs font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
