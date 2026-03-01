import { useEffect, useRef } from 'react';
import { Camera, Eye, Keyboard, MousePointer, Move, ZoomIn } from 'lucide-react';
import {
  useComputerUseStore,
  selectActionLog,
  type ActionType,
  type ComputerAction,
} from '../../stores/computerUseStore';
import { cn } from '../../lib/utils';

const ACTION_ICONS: Record<ActionType, typeof MousePointer> = {
  click: MousePointer,
  double_click: MousePointer,
  right_click: MousePointer,
  move_mouse: Move,
  type: Keyboard,
  key_press: Keyboard,
  screenshot: Camera,
  scroll: Eye,
  zoom: ZoomIn,
};

const ACTION_COLORS: Record<ActionType, string> = {
  click: 'text-blue-400',
  double_click: 'text-blue-400',
  right_click: 'text-orange-400',
  move_mouse: 'text-zinc-400',
  type: 'text-emerald-400',
  key_press: 'text-emerald-400',
  screenshot: 'text-purple-400',
  scroll: 'text-yellow-400',
  zoom: 'text-teal-400',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function describeAction(action: ComputerAction): string {
  switch (action.action_type) {
    case 'click':
      return action.coordinates
        ? `Click at (${action.coordinates[0]}, ${action.coordinates[1]})`
        : 'Click';
    case 'double_click':
      return action.coordinates
        ? `Double click at (${action.coordinates[0]}, ${action.coordinates[1]})`
        : 'Double click';
    case 'right_click':
      return action.coordinates
        ? `Right click at (${action.coordinates[0]}, ${action.coordinates[1]})`
        : 'Right click';
    case 'move_mouse':
      return action.coordinates
        ? `Move to (${action.coordinates[0]}, ${action.coordinates[1]})`
        : 'Move mouse';
    case 'type':
      return action.text
        ? `Type "${action.text.length > 40 ? action.text.slice(0, 40) + '...' : action.text}"`
        : 'Type text';
    case 'key_press':
      return action.key ? `Key press: ${action.key}` : 'Key press';
    case 'screenshot':
      return 'Screenshot captured';
    case 'scroll':
      return action.text || 'Scroll';
    case 'zoom':
      return action.text || 'Zoom region';
    default:
      return action.action_type;
  }
}

export function ActionLog() {
  const actionLog = useComputerUseStore(selectActionLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actionLog.length]);

  if (actionLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <Eye className="w-8 h-8 mb-2 text-zinc-600" />
        <p className="text-sm font-medium">No actions yet</p>
        <p className="text-xs text-zinc-600 mt-1">Actions will appear here as the agent works</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-64 overflow-y-auto space-y-0.5 p-2">
      {actionLog.map((action, i) => {
        const Icon = ACTION_ICONS[action.action_type] || Eye;
        const color = ACTION_COLORS[action.action_type] || 'text-zinc-400';

        return (
          <div
            key={i}
            className={cn(
              'flex items-start gap-2 px-2 py-1.5 rounded-md text-sm',
              'hover:bg-zinc-800/50 transition-colors',
            )}
          >
            <span className="text-xs text-zinc-600 font-mono mt-0.5 shrink-0">
              {formatTimestamp(action.timestamp)}
            </span>
            <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', color)} />
            <span className="text-zinc-300 break-words">{describeAction(action)}</span>
          </div>
        );
      })}
    </div>
  );
}
