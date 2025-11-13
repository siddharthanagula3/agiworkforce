import { useState, useMemo } from 'react';
import { useBrowserStore, type BrowserAction, type ActionType } from '../../stores/browserStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import {
  Navigation,
  MousePointer,
  Keyboard,
  Download,
  Camera,
  Scroll,
  Clock,
  Code,
  Search,
  Trash2,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface BrowserActionLogProps {
  className?: string;
  onActionClick?: (action: BrowserAction) => void;
}

const ACTION_ICONS: Record<ActionType, any> = {
  navigate: Navigation,
  click: MousePointer,
  type: Keyboard,
  extract: Download,
  screenshot: Camera,
  scroll: Scroll,
  wait: Clock,
  execute: Code,
};

const ACTION_COLORS: Record<ActionType, string> = {
  navigate: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  click: 'bg-green-500/10 text-green-600 border-green-500/20',
  type: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  extract: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  screenshot: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  scroll: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  wait: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  execute: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function BrowserActionLog({ className, onActionClick }: BrowserActionLogProps) {
  const { actions, clearActions } = useBrowserStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ActionType | 'all'>('all');

  const filteredActions = useMemo(() => {
    return actions.filter((action) => {
      // Filter by type
      if (filterType !== 'all' && action.type !== filterType) {
        return false;
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesType = action.type.toLowerCase().includes(query);
        const matchesUrl = action.details.url?.toLowerCase().includes(query);
        const matchesSelector = action.details.selector?.toLowerCase().includes(query);
        const matchesText = action.details.text?.toLowerCase().includes(query);
        return matchesType || matchesUrl || matchesSelector || matchesText;
      }

      return true;
    });
  }, [actions, searchQuery, filterType]);

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getActionDescription = (action: BrowserAction) => {
    switch (action.type) {
      case 'navigate':
        return action.details.url || 'Unknown URL';
      case 'click':
        return action.details.selector || 'Unknown element';
      case 'type':
        return `"${action.details.text}" into ${action.details.selector}`;
      case 'extract':
        return action.details.selector || 'Page content';
      case 'screenshot':
        return 'Screenshot captured';
      case 'scroll':
        return action.details.selector || 'Page';
      case 'wait':
        return action.details.selector || `${action.duration}ms`;
      case 'execute':
        return action.details.script || 'Script';
      default:
        return 'Unknown action';
    }
  };

  const exportActions = () => {
    const dataStr = JSON.stringify(actions, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    const exportFileDefaultName = `browser-actions-${Date.now()}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search actions..."
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={exportActions} disabled={actions.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button variant="ghost" size="sm" onClick={clearActions} disabled={actions.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto">
        <Button
          variant={filterType === 'all' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setFilterType('all')}
        >
          All ({actions.length})
        </Button>
        {(['navigate', 'click', 'type', 'extract', 'screenshot', 'scroll', 'wait', 'execute'] as ActionType[]).map(
          (type) => {
            const count = actions.filter((a) => a.type === type).length;
            if (count === 0) return null;

            const Icon = ACTION_ICONS[type];
            return (
              <Button
                key={type}
                variant={filterType === type ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterType(type)}
              >
                <Icon className="h-3 w-3 mr-1" />
                {type} ({count})
              </Button>
            );
          }
        )}
      </div>

      {/* Action list */}
      <ScrollArea className="flex-1">
        {filteredActions.length > 0 ? (
          <div className="divide-y divide-border">
            {filteredActions.map((action, index) => {
              const Icon = ACTION_ICONS[action.type];
              return (
                <div
                  key={action.id}
                  className={cn(
                    'px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer',
                    !action.success && 'bg-red-500/5'
                  )}
                  onClick={() => onActionClick?.(action)}
                >
                  <div className="flex items-start gap-3">
                    {/* Timeline indicator */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'h-8 w-8 rounded-full border flex items-center justify-center',
                          ACTION_COLORS[action.type]
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {index < filteredActions.length - 1 && (
                        <div className="w-px h-full bg-border mt-1" />
                      )}
                    </div>

                    {/* Action details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs capitalize">
                          {action.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(action.timestamp)}
                        </span>
                        {action.duration && (
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(action.duration)}
                          </span>
                        )}
                        {action.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </div>

                      <div className="text-sm text-foreground truncate">
                        {getActionDescription(action)}
                      </div>

                      {action.details.error && (
                        <div className="text-xs text-red-600 mt-1 truncate">
                          Error: {action.details.error}
                        </div>
                      )}

                      {action.screenshotId && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Camera className="h-3 w-3" />
                          Screenshot available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-2">
              <div className="text-sm">
                {searchQuery || filterType !== 'all' ? 'No matching actions' : 'No actions recorded'}
              </div>
              {(searchQuery || filterType !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterType('all');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Stats footer */}
      {actions.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground bg-muted/10">
          <div>
            Total: {actions.length} actions
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-600" />
              {actions.filter((a) => a.success).length} succeeded
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-600" />
              {actions.filter((a) => !a.success).length} failed
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
