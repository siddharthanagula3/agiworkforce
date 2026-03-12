/**
 * MemorySidebar Component
 *
 * Compact sidebar widget for displaying important memories
 * during chat interactions. Shows recent and high-importance memories
 * with quick access to the memory browser.
 */
import { memo, useCallback, useState } from 'react';
import { Brain, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import type { MemoryEntry } from '@/stores/memoryStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { CreateMemoryDialog } from './CreateMemoryDialog';
import { CompactMemoryImportanceIndicator } from './MemoryImportanceIndicator';

const CATEGORY_COLORS: Record<string, string> = {
  preference: 'bg-blue-500/10 text-blue-300',
  fact: 'bg-green-500/10 text-green-300',
  decision: 'bg-purple-500/10 text-purple-300',
  context: 'bg-gray-500/10 text-gray-300',
};

export interface MemorySidebarProps {
  /** Maximum number of memories to display */
  maxMemories?: number;
  /** Show only important memories (importance >= threshold) */
  importanceThreshold?: number;
  /** Additional class names */
  className?: string;
  /** Callback when memory is clicked */
  onMemoryClick?: (memory: MemoryEntry) => void;
}

export const MemorySidebar = memo(function MemorySidebar({
  maxMemories = 5,
  importanceThreshold = 6,
  className,
  onMemoryClick,
}: MemorySidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  const { memories } = useMemoryStore();

  // Get important memories sorted by importance then date
  const importantMemories = memories
    .filter((m) => m.importance >= importanceThreshold)
    .sort((a, b) => {
      // Sort by importance first
      const importanceDiff = b.importance - a.importance;
      if (importanceDiff !== 0) return importanceDiff;
      // Then by date
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .slice(0, maxMemories);

  const handleMemoryClick = useCallback(
    (memory: MemoryEntry) => {
      onMemoryClick?.(memory);
    },
    [onMemoryClick],
  );

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-zinc-800/50 border border-zinc-700 rounded-lg overflow-hidden transition-all duration-200',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-700 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Memories</h3>
          {importantMemories.length > 0 && (
            <Badge variant="secondary" className="bg-zinc-700 text-xs">
              {importantMemories.length}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-white"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-white"
            onClick={() => setIsVisible(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0">
          {importantMemories.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-3 text-center">
              <Brain className="h-8 w-8 text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-500">No important memories yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Memories with importance 6+ will appear here
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-2">
                {importantMemories.map((memory) => (
                  <button type="button"
                    key={memory.id}
                    onClick={() => handleMemoryClick(memory)}
                    className="w-full flex flex-col gap-2 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-left group"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-medium text-white truncate group-hover:text-blue-300">
                          {memory.topic}
                        </h4>
                        <Badge
                          className={cn(
                            'text-xs mt-1',
                            CATEGORY_COLORS[memory.category] || 'bg-zinc-700 text-zinc-300',
                          )}
                        >
                          {memory.category}
                        </Badge>
                      </div>
                    </div>

                    {/* Preview */}
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {memory.content.length > 80
                        ? `${memory.content.substring(0, 80)}...`
                        : memory.content}
                    </p>

                    {/* Importance Indicator */}
                    <CompactMemoryImportanceIndicator
                      importance={memory.importance}
                      createdAt={memory.created_at}
                      lastAccessedAt={memory.updated_at}
                    />
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Footer Actions */}
          <div className="border-t border-zinc-700 p-2 bg-zinc-900/50">
            <CreateMemoryDialog
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs text-zinc-400 hover:text-white hover:bg-zinc-700"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Memory
                </Button>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Memory loaded indicator badge
 */
export interface MemoryLoadedIndicatorProps {
  /** Show inline indicator */
  inline?: boolean;
}

export const MemoryLoadedIndicator = memo(function MemoryLoadedIndicator() {
  const { memories, isLoading } = useMemoryStore();

  if (isLoading) {
    return (
      <Badge variant="secondary" className="bg-blue-500/10 text-blue-300">
        <span className="inline-block h-2 w-2 rounded-full bg-blue-400 mr-1 animate-pulse" />
        Loading memories...
      </Badge>
    );
  }

  if (memories.length === 0) {
    return null;
  }

  const importantCount = memories.filter((m) => m.importance >= 6).length;

  return (
    <Badge variant="secondary" className="bg-green-500/10 text-green-300">
      <span className="inline-block h-2 w-2 rounded-full bg-green-400 mr-1" />
      {importantCount} memory{importantCount === 1 ? '' : 'ies'} loaded
    </Badge>
  );
});
