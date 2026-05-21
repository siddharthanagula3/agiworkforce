import { useState } from 'react';
import {
  Monitor,
  MousePointer,
  Keyboard,
  Camera,
  Move,
  ArrowUpDown,
  Command,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolResultProps } from './index';

const ACTION_ICONS: Record<string, React.ElementType> = {
  click: MousePointer,
  double_click: MousePointer,
  type: Keyboard,
  screenshot: Camera,
  capture_screen: Camera,
  move_mouse: Move,
  scroll: ArrowUpDown,
  key_press: Command,
  zoom_region: Camera,
  execute_tool: Zap,
  execute_anthropic: Zap,
};

interface ComputerUseResultData {
  action?: string;
  success?: boolean;
  error?: string;
  screenshotBase64?: string;
  imageBase64?: string;
  x?: number;
  y?: number;
  coordinate_x?: number;
  coordinate_y?: number;
  text?: string;
  key?: string;
  direction?: string;
  duration_ms?: number;
}

function getActionSummary(data: ComputerUseResultData, toolName: string): string {
  const action = data.action ?? extractActionFromToolName(toolName);

  if (action === 'click' || action === 'double_click') {
    const x = data.x ?? data.coordinate_x;
    const y = data.y ?? data.coordinate_y;
    if (x !== undefined && y !== undefined) return `Clicked at (${x}, ${y})`;
    return 'Clicked';
  }

  if (action === 'type') {
    if (data.text) {
      const preview = data.text.length > 40 ? `${data.text.slice(0, 37)}...` : data.text;
      return `Typed '${preview}'`;
    }
    return 'Typed text';
  }

  if (action === 'screenshot' || action === 'capture_screen') {
    return 'Captured screenshot';
  }

  if (action === 'move_mouse') {
    const x = data.x ?? data.coordinate_x;
    const y = data.y ?? data.coordinate_y;
    if (x !== undefined && y !== undefined) return `Moved to (${x}, ${y})`;
    return 'Moved mouse';
  }

  if (action === 'scroll') {
    return `Scrolled ${data.direction ?? 'down'}`;
  }

  if (action === 'key_press') {
    return data.key ? `Pressed ${data.key}` : 'Key press';
  }

  return action || 'Computer action';
}

function extractActionFromToolName(toolName: string): string {
  const suffix = toolName
    .replace(/^computer_use_/, '')
    .replace(/_/g, ' ')
    .trim();
  return suffix || 'action';
}

function getActionIcon(data: ComputerUseResultData, toolName: string): React.ElementType {
  const action = data.action ?? extractActionFromToolName(toolName).replace(/\s+/g, '_');
  return ACTION_ICONS[action] ?? Monitor;
}

export const InlineComputerUseResult: React.FC<ToolResultProps> = ({ result, status }) => {
  const [showScreenshot, setShowScreenshot] = useState(false);

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
        <span className="text-sm text-muted-foreground">Performing computer action...</span>
      </div>
    );
  }

  const data = (result?.data ?? result ?? {}) as ComputerUseResultData;
  const toolName = (result as Record<string, unknown>)?.['toolName'] as string | undefined;
  const resolvedToolName = toolName ?? 'computer_use';

  const ActionIcon = getActionIcon(data, resolvedToolName);
  const summary = getActionSummary(data, resolvedToolName);
  const screenshotBase64 = data.screenshotBase64 ?? data.imageBase64;
  const isError = status === 'error' || status === 'failed' || data.success === false;

  return (
    <div
      className={cn(
        'mt-3 rounded-lg border overflow-hidden bg-surface-elevated',
        isError ? 'border-destructive/30' : 'border-border/50',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <ActionIcon
          className={cn('h-4 w-4 shrink-0', isError ? 'text-red-400' : 'text-cyan-400')}
        />
        <span className="text-sm text-foreground flex-1 min-w-0 truncate">{summary}</span>
        {data.error && <span className="text-xs text-red-400 shrink-0">Failed</span>}
      </div>

      {/* Error detail */}
      {data.error && (
        <div className="px-3 pb-2">
          <p className="text-xs text-red-400">{data.error}</p>
        </div>
      )}

      {/* Screenshot thumbnail */}
      {screenshotBase64 && (
        <div className="border-t border-border/30">
          <button
            type="button"
            onClick={() => setShowScreenshot(!showScreenshot)}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Camera className="h-3 w-3" />
            Screenshot
            {showScreenshot ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showScreenshot && (
            <div className="px-3 pb-3">
              <img
                src={`data:image/png;base64,${screenshotBase64}`}
                alt="Action screenshot"
                className="w-full rounded border border-border/50 object-contain"
                style={{ maxHeight: 150 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
