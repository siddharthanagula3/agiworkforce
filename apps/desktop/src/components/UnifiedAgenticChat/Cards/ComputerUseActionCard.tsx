import { useState } from 'react';
import {
  Monitor,
  MousePointer,
  Keyboard,
  Camera,
  ChevronDown,
  ChevronUp,
  Move,
  ArrowUpDown,
  Command,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '../../ui/Badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../ui/Collapsible';

export interface ComputerUseActionCardProps {
  action: string;
  input?: Record<string, unknown>;
  success?: boolean;
  error?: string;
  screenshotBase64?: string;
  duration?: number;
}

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

const ACTION_LABELS: Record<string, string> = {
  click: 'click',
  double_click: 'double click',
  type: 'type',
  screenshot: 'screenshot',
  capture_screen: 'screenshot',
  move_mouse: 'move mouse',
  scroll: 'scroll',
  key_press: 'key press',
  zoom_region: 'zoom region',
  execute_tool: 'execute',
  execute_anthropic: 'execute',
};

function getActionDescription(action: string, input?: Record<string, unknown>): string {
  if (!input) return action;

  const normalized = action.toLowerCase().replace(/\s+/g, '_');

  if (normalized === 'click' || normalized === 'double_click') {
    const x = input['x'] ?? input['coordinate_x'];
    const y = input['y'] ?? input['coordinate_y'];
    if (x !== undefined && y !== undefined) {
      return `Clicked at (${x}, ${y})`;
    }
    return 'Clicked';
  }

  if (normalized === 'type') {
    const text = input['text'] ?? input['content'];
    if (typeof text === 'string') {
      const preview = text.length > 60 ? `${text.slice(0, 57)}...` : text;
      return `Typed '${preview}'`;
    }
    return 'Typed text';
  }

  if (normalized === 'screenshot' || normalized === 'capture_screen') {
    return 'Took screenshot';
  }

  if (normalized === 'move_mouse') {
    const x = input['x'] ?? input['coordinate_x'];
    const y = input['y'] ?? input['coordinate_y'];
    if (x !== undefined && y !== undefined) {
      return `Moved to (${x}, ${y})`;
    }
    return 'Moved mouse';
  }

  if (normalized === 'scroll') {
    const direction = input['direction'] ?? input['scroll_direction'];
    const amount = input['amount'] ?? input['scroll_amount'];
    return `Scrolled ${direction ?? 'down'}${amount ? ` by ${amount}` : ''}`;
  }

  if (normalized === 'key_press') {
    const key = input['key'] ?? input['keys'];
    return key ? `Pressed ${key}` : 'Key press';
  }

  if (normalized === 'zoom_region') {
    return 'Zoomed into region';
  }

  return action;
}

function getCoordinates(input?: Record<string, unknown>): { x: number; y: number } | null {
  if (!input) return null;
  const x = input['x'] ?? input['coordinate_x'];
  const y = input['y'] ?? input['coordinate_y'];
  if (typeof x === 'number' && typeof y === 'number') {
    return { x, y };
  }
  return null;
}

export const ComputerUseActionCard: React.FC<ComputerUseActionCardProps> = ({
  action,
  input,
  success = true,
  error,
  screenshotBase64,
  duration,
}) => {
  const [screenshotOpen, setScreenshotOpen] = useState(false);

  const normalizedAction = action.toLowerCase().replace(/\s+/g, '_');
  const ActionIcon = ACTION_ICONS[normalizedAction] ?? Monitor;
  const actionLabel = ACTION_LABELS[normalizedAction] ?? action;
  const description = getActionDescription(action, input);
  const coordinates = getCoordinates(input);

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        success
          ? 'border-cyan-200 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-900/10'
          : 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        <div
          className={cn(
            'p-1.5 rounded-md shrink-0',
            success
              ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-500'
              : 'bg-red-100 dark:bg-red-900/30 text-red-500',
          )}
        >
          <ActionIcon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-cyan-500">Computer Use</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">
              {actionLabel}
            </Badge>
            {success === false && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <XCircle size={12} />
                Failed
              </span>
            )}
            {success === true && !error && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircle2 size={12} />
              </span>
            )}
          </div>

          {/* Action description */}
          <p className="text-sm text-gray-800 dark:text-gray-200">{description}</p>

          {/* Error message */}
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}

          {/* Metadata row */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {coordinates && (
              <span className="text-xs text-muted-foreground bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                ({coordinates.x}, {coordinates.y})
              </span>
            )}
            {duration !== undefined && duration > 0 && (
              <span className="text-xs text-muted-foreground">
                {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Screenshot collapsible */}
      {screenshotBase64 && (
        <Collapsible open={screenshotOpen} onOpenChange={setScreenshotOpen}>
          <div className="border-t border-cyan-200 dark:border-cyan-800">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <Camera size={12} />
                Screenshot
                {screenshotOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3">
                <img
                  src={`data:image/png;base64,${screenshotBase64}`}
                  alt="Computer use screenshot"
                  className="w-full rounded border border-border/50 object-contain"
                  style={{ maxHeight: 200 }}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
};
