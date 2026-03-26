// apps/desktop/src/components/UnifiedAgenticChat/ToolLabel.tsx
import { motion } from 'framer-motion';
import {
  FileText,
  Terminal,
  Search,
  Globe,
  Edit3,
  FolderOpen,
  GitBranch,
  Image,
  Database,
  Loader2,
  Check,
  X,
  Wrench,
  MousePointerClick,
  Code,
  Box,
  HelpCircle,
  ListTodo,
  Video,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ToolLabelEntry } from '@agiworkforce/types';
import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { codeEditing } from '@agiworkforce/api';
import { useToolStore } from '../../stores/chat/toolStore';

export type { ToolLabelEntry };

const ICON_MAP: Record<string, React.ElementType> = {
  // Filesystem
  Read: FileText,
  Write: FileText,
  Edit: Edit3,
  MultiEdit: Edit3,
  ApplyPatch: Edit3,
  LS: FolderOpen,
  // Search
  Search: Search,
  Grep: Search,
  CodeSearch: Code,
  Glob: FolderOpen,
  // Terminal
  Bash: Terminal,
  // Web
  WebSearch: Globe,
  WebFetch: Globe,
  // Data
  Memory: Database,
  // Git
  Git: GitBranch,
  // Media
  ImageGen: Image,
  VideoGen: Video,
  // Interactive
  Question: HelpCircle,
  TodoWrite: ListTodo,
  // Browser / UI automation — display names from toolDisplayNames.ts
  Click: MousePointerClick,
  Clicking: MousePointerClick,
  Browsing: Globe,
  Typing: Edit3,
  'Open website': Globe,
  'Take screenshot': Image,
  'Scroll page': Globe,
  'Type text': Edit3,
  // MCP fallback display names
  'Run database query': Database,
  'List tables': Database,
  'Read file': FileText,
  'Save file': FileText,
  'List files': FolderOpen,
  'List allowed folders': FolderOpen,
  'Run command': Terminal,
  'Run code': Code,
  'Search the web': Globe,
  'Create image': Image,
  'Create video': Video,
  // MCP source indicator
  MCP: Box,
};

const DIFF_EDIT_NAMES = new Set(['Edit', 'MultiEdit', 'ApplyPatch', 'Write']);
const TERMINAL_NAMES = new Set(['Bash', 'Run command', 'Run code']);
const READ_FILE_NAMES = new Set(['Read', 'Read file']);
const SCREENSHOT_NAMES = new Set(['Take screenshot', 'ImageGen', 'Create image']);
const MAX_DIFF_LINES_INITIAL = 20;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface DiffViewProps {
  diff: string;
  checkpointId?: string;
  onRewind?: () => void;
}

function DiffView({ diff, checkpointId, onRewind }: DiffViewProps) {
  const [showAll, setShowAll] = useState(false);
  const [rewinding, setRewinding] = useState(false);

  const lines = diff.split('\n');
  const visibleLines = showAll ? lines : lines.slice(0, MAX_DIFF_LINES_INITIAL);
  const hasMore = lines.length > MAX_DIFF_LINES_INITIAL;

  const handleRewind = useCallback(async () => {
    if (!checkpointId) return;
    setRewinding(true);
    try {
      await codeEditing.codingCheckpointRewind(checkpointId);
      onRewind?.();
    } catch (err) {
      console.error('[ToolLabel] Rewind failed:', err);
      toast.error('Rewind failed', {
        description: err instanceof Error ? err.message : 'Could not undo this change',
      });
    } finally {
      setRewinding(false);
    }
  }, [checkpointId, onRewind]);

  return (
    <div className="mt-1.5 w-full">
      <div className="rounded-sm border border-white/10 overflow-hidden">
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <pre className="font-mono text-xs leading-relaxed p-1.5 select-text">
            {visibleLines.map((line, i) => {
              const isAdded = line.startsWith('+');
              const isRemoved = line.startsWith('-');
              return (
                <div
                  key={i}
                  className={cn(
                    'px-1',
                    isAdded && 'bg-green-900/20 text-green-300',
                    isRemoved && 'bg-red-900/20 text-red-300',
                    !isAdded && !isRemoved && 'text-muted-foreground',
                  )}
                >
                  {line || ' '}
                </div>
              );
            })}
          </pre>
        </div>

        {hasMore && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full px-2 py-1 text-xs text-center text-muted-foreground hover:text-foreground border-t border-white/10 transition-colors"
          >
            Show {lines.length - MAX_DIFF_LINES_INITIAL} more lines
          </button>
        )}
      </div>

      {checkpointId && (
        <button
          type="button"
          onClick={handleRewind}
          disabled={rewinding}
          className={cn(
            'mt-1 flex items-center gap-1 text-xs rounded px-1.5 py-0.5',
            'text-muted-foreground hover:text-foreground border border-white/10',
            'hover:border-white/20 transition-colors',
            rewinding && 'opacity-50 cursor-not-allowed',
          )}
        >
          <RotateCcw className="w-3 h-3" />
          {rewinding ? 'Rewinding…' : 'Undo'}
        </button>
      )}
    </div>
  );
}

/** Terminal output block — monospace pre with dark bg, max-height + scroll. */
function TerminalOutputView({ output }: { output: string }) {
  const trimmed = output.trim();
  if (!trimmed) return null;
  return (
    <div className="mt-1.5 rounded-sm border border-white/10 overflow-hidden">
      <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
        <pre className="font-mono text-[11px] leading-relaxed p-2 text-emerald-300/90 bg-black/60 select-text whitespace-pre-wrap break-words">
          {trimmed}
        </pre>
      </div>
    </div>
  );
}

/** File content preview — first 10 lines of result_preview text. */
function FilePreviewView({ content }: { content: string }) {
  const lines = content.split('\n');
  const preview = lines.slice(0, 10).join('\n');
  const truncated = lines.length > 10;
  return (
    <div className="mt-1.5 rounded-sm border border-white/10 overflow-hidden">
      <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
        <pre className="font-mono text-[11px] leading-relaxed p-2 text-slate-300/80 bg-black/40 select-text whitespace-pre-wrap break-words">
          {preview}
          {truncated && <span className="text-muted-foreground/50">{'\n'}…</span>}
        </pre>
      </div>
    </div>
  );
}

/** Screenshot thumbnail — renders a base64 image in a small contained box. */
function ScreenshotView({ imageBase64 }: { imageBase64: string }) {
  return (
    <div className="mt-1.5 rounded-sm border border-white/10 overflow-hidden inline-block max-w-full">
      <img
        src={`data:image/png;base64,${imageBase64}`}
        alt="Screenshot"
        className="max-h-[200px] max-w-full object-contain block"
      />
    </div>
  );
}

export function ToolLabel({ entry }: { entry: ToolLabelEntry }) {
  const Icon = ICON_MAP[entry.displayName] ?? Wrench;
  const isRunning = entry.status === 'running';
  const isError = entry.status === 'error';
  const errorTitle = isError && entry.error ? entry.error : undefined;

  const [outputExpanded, setOutputExpanded] = useState(false);

  // Pull live stream output for running tools (terminal output buffer)
  const activeStream = useToolStore((s) => s.activeToolStreams.get(entry.id));
  // Pull screenshots matching this tool id
  const screenshot = useToolStore((s) =>
    s.screenshots.find((sc) => sc.id === entry.id || sc.action === entry.id),
  );

  // Classify tool type
  const isEditTool = DIFF_EDIT_NAMES.has(entry.displayName);
  const isTerminalTool = TERMINAL_NAMES.has(entry.displayName);
  const isReadTool = READ_FILE_NAMES.has(entry.displayName);
  const isScreenshotTool = SCREENSHOT_NAMES.has(entry.displayName);

  const resultPreview = entry.resultPreview;
  const checkpointId = entry.checkpointId;

  // Terminal: use live stream buffer while running, resultPreview when done
  const terminalOutput: string | undefined = isTerminalTool
    ? isRunning
      ? activeStream?.outputBuffer || undefined
      : resultPreview || undefined
    : undefined;

  // Diff: Edit/Write tools show diff from resultPreview
  const diffContent: string | undefined =
    isEditTool && !isRunning && resultPreview ? resultPreview : undefined;

  // File preview: Read tools show first lines of resultPreview (skip if it looks like a diff)
  const filePreviewContent: string | undefined =
    isReadTool && !isRunning && resultPreview && !resultPreview.startsWith('---')
      ? resultPreview
      : undefined;

  // Screenshot: from store or resultPreview for screenshot tools
  const screenshotBase64: string | undefined = isScreenshotTool
    ? (screenshot?.imageBase64 ?? resultPreview ?? undefined)
    : undefined;

  const hasOutput = Boolean(
    terminalOutput || diffContent || filePreviewContent || screenshotBase64,
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex flex-col min-w-0 py-0.5 text-xs font-mono',
        isError ? 'text-red-400' : 'text-muted-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        {isRunning ? (
          <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
        ) : isError ? (
          <X className="w-3 h-3 text-red-400 shrink-0" />
        ) : (
          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
        )}

        {/* Tool icon */}
        <Icon className="w-3 h-3 shrink-0" />

        {/* Tool label: Name(args) */}
        <span className="truncate max-w-[300px]" title={errorTitle}>
          <span className="text-foreground/80">{entry.displayName}</span>
          {entry.displayArgs && (
            <span className="text-muted-foreground">({entry.displayArgs})</span>
          )}
          {isRunning && <span className="text-violet-400">...</span>}
        </span>

        {isError && entry.error && (
          <span className="truncate max-w-[240px] text-red-400/80" title={entry.error}>
            {entry.error}
          </span>
        )}

        {/* Duration */}
        {entry.durationMs != null && !isRunning && (
          <span className="text-muted-foreground/60 ml-auto tabular-nums shrink-0">
            {formatDuration(entry.durationMs)}
          </span>
        )}

        {/* Output toggle — shown when there is any expandable content */}
        {hasOutput && (
          <button
            type="button"
            onClick={() => setOutputExpanded((prev) => !prev)}
            className="ml-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={outputExpanded ? 'Collapse output' : 'Expand output'}
          >
            {outputExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Inline output section — shown when expanded */}
      {hasOutput && outputExpanded && (
        <div className="pl-8">
          {terminalOutput && <TerminalOutputView output={terminalOutput} />}
          {diffContent && <DiffView diff={diffContent} checkpointId={checkpointId} />}
          {filePreviewContent && !diffContent && <FilePreviewView content={filePreviewContent} />}
          {screenshotBase64 && <ScreenshotView imageBase64={screenshotBase64} />}
        </div>
      )}
    </motion.div>
  );
}
