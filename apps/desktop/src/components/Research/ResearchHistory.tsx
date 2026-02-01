/**
 * ResearchHistory Component
 *
 * Displays a list of past research sessions with the ability
 * to view summaries and reload previous research.
 */
import { memo, useCallback, useState } from 'react';
import { History, Clock, BookOpen, ChevronRight, Trash2, Search, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Input } from '@/components/ui/Input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/AlertDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
import { useResearchStore, selectHistory, type ResearchHistoryEntry } from '@/stores/researchStore';

const CONFIDENCE_COLORS: Record<string, string> = {
  very_low: 'bg-red-500/10 text-red-500',
  low: 'bg-orange-500/10 text-orange-500',
  medium: 'bg-yellow-500/10 text-yellow-500',
  high: 'bg-green-500/10 text-green-500',
  very_high: 'bg-emerald-500/10 text-emerald-500',
};

const MODE_LABELS: Record<string, string> = {
  quick: 'Quick',
  standard: 'Standard',
  deep: 'Deep',
  exhaustive: 'Exhaustive',
};

export interface ResearchHistoryProps {
  className?: string;
  onSelectEntry?: (entry: ResearchHistoryEntry) => void;
}

export const ResearchHistory = memo(function ResearchHistory({
  className,
  onSelectEntry,
}: ResearchHistoryProps) {
  const history = useResearchStore(selectHistory);
  const { clearHistory, removeFromHistory } = useResearchStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<ResearchHistoryEntry | null>(null);

  const filteredHistory = searchQuery.trim()
    ? history.filter(
        (entry) =>
          entry.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.summary.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : history;

  const handleViewEntry = useCallback((entry: ResearchHistoryEntry) => {
    setSelectedEntry(entry);
  }, []);

  const handleUseEntry = useCallback(
    (entry: ResearchHistoryEntry) => {
      onSelectEntry?.(entry);
      setSelectedEntry(null);
    },
    [onSelectEntry],
  );

  if (history.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8', className)}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <History className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground">No Research History</h3>
        <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
          Your completed research sessions will appear here for easy reference.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Research History</h2>
          <span className="text-sm text-muted-foreground">({history.length})</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Research History?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all {history.length} research entries. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={clearHistory}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Clear All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Search */}
      <div className="py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* History List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-4">
          {filteredHistory.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              onView={handleViewEntry}
              onDelete={removeFromHistory}
            />
          ))}
          {filteredHistory.length === 0 && searchQuery && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No results found for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">{selectedEntry?.query}</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-4">
                {/* Meta info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{MODE_LABELS[selectedEntry.mode]}</Badge>
                  <Badge
                    variant="outline"
                    className={cn('capitalize', CONFIDENCE_COLORS[selectedEntry.confidence])}
                  >
                    {selectedEntry.confidence.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(selectedEntry.timestamp)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(selectedEntry.duration_secs)}
                  </span>
                </div>

                {/* Summary */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Summary</h4>
                  <p className="text-sm text-muted-foreground">{selectedEntry.summary}</p>
                </div>

                {/* Key Findings */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Key Findings</h4>
                  <ul className="space-y-1.5">
                    {selectedEntry.key_findings.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span className="text-muted-foreground">{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                {onSelectEntry && (
                  <div className="pt-4 border-t">
                    <Button onClick={() => handleUseEntry(selectedEntry)} className="w-full">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Use This Research
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

interface HistoryCardProps {
  entry: ResearchHistoryEntry;
  onView: (entry: ResearchHistoryEntry) => void;
  onDelete: (id: string) => void;
}

function HistoryCard({ entry, onView, onDelete }: HistoryCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => onView(entry)}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm font-medium truncate">{entry.query}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{entry.summary}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {MODE_LABELS[entry.mode]}
              </Badge>
              <Badge
                variant="outline"
                className={cn('text-xs capitalize', CONFIDENCE_COLORS[entry.confidence])}
              >
                {entry.confidence.replace('_', ' ')}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(entry.timestamp)}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(entry.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Utility functions

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

export default ResearchHistory;
