import { ChevronRight, Share2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

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
  conversationTitle?: string | null;
  showShareAction?: boolean;
  onShare?: () => void;
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

export function Breadcrumb({
  activeView,
  onNavigateHome,
  conversationTitle,
  showShareAction = false,
  onShare,
}: BreadcrumbProps) {
  const viewLabel = activeView ? VIEW_LABELS[activeView] || activeView : null;
  const title = conversationTitle?.trim() || 'New chat';

  return (
    <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-[hsl(var(--border))] px-4">
      <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        {activeView ? (
          <>
            <button
              type="button"
              onClick={onNavigateHome}
              className={cn(
                'rounded px-1 transition-colors hover:text-slate-900 dark:hover:text-slate-200',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              Home
            </button>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium text-slate-900 dark:text-slate-100">
              {viewLabel}
            </span>
          </>
        ) : (
          <span />
        )}
      </div>

      <div className="min-w-0 px-4 text-center">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {title}
        </div>
      </div>

      <div className="flex justify-end">
        {showShareAction && onShare ? (
          <Button variant="ghost" size="sm" onClick={onShare} className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
