import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface BreadcrumbProps {
  activeView:
    | 'memory'
    | 'tasks'
    | 'canvas'
    | 'mcp-apps'
    | 'research'
    | 'rewind'
    | 'mcp-workspace'
    | 'mcp-bundles'
    | 'images'
    | 'skills'
    | 'schedules'
    | 'artifacts'
    | null;
  onNavigateHome: () => void;
}

const VIEW_LABELS: Record<string, string> = {
  memory: 'Memory',
  tasks: 'Tasks',
  canvas: 'Canvas',
  'mcp-apps': 'MCP Apps',
  research: 'Deep Research',
  rewind: 'Rewind Timeline',
  'mcp-workspace': 'MCP Workspace',
  'mcp-bundles': 'Tool Registry',
  images: 'Images',
  skills: 'Skills',
  schedules: 'Schedules',
  artifacts: 'Artifacts Gallery',
};

export function Breadcrumb({ activeView, onNavigateHome }: BreadcrumbProps) {
  // Show nothing when in chat view
  if (!activeView) {
    return null;
  }

  const viewLabel = VIEW_LABELS[activeView] || activeView;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-400">
      <button
        type="button"
        onClick={onNavigateHome}
        className={cn(
          'transition-colors hover:text-slate-900 dark:hover:text-slate-200',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded px-1',
        )}
      >
        Home
      </button>
      <ChevronRight className="h-4 w-4 flex-shrink-0" />
      <span className="font-medium text-slate-900 dark:text-slate-100">{viewLabel}</span>
    </div>
  );
}
