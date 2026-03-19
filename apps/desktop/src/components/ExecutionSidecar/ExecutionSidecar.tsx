import { ChevronLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExecutionSidecarStore } from '../../stores/executionSidecarStore';
import { ResizeHandle } from '../ui/ResizeHandle';
import { ExecutionSidecarHeader } from './ExecutionSidecarHeader';
import { ExecutionSidecarTimeline } from './ExecutionSidecarTimeline';
import { ExecutionSidecarScreenView } from './ExecutionSidecarScreenView';
import { ExecutionSidecarTerminal } from './ExecutionSidecarTerminal';
import { ExecutionSidecarApprovals } from './ExecutionSidecarApprovals';
import { ExecutionSidecarFilmstrip } from './ExecutionSidecarFilmstrip';
import { useExecutionSidecarContext } from '../../hooks/useExecutionSidecarContext';

const COLLAPSED_WIDTH = 40;

function ContextView({ context }: { context: string }) {
  switch (context) {
    case 'timeline':
      return <ExecutionSidecarTimeline />;
    case 'screenshot':
      return <ExecutionSidecarScreenView />;
    case 'browser':
      return <ExecutionSidecarScreenView />;
    case 'terminal':
      return <ExecutionSidecarTerminal />;
    case 'approval':
      return <ExecutionSidecarApprovals />;
    default:
      return <ExecutionSidecarTimeline />;
  }
}

export function ExecutionSidecar() {
  const isOpen = useExecutionSidecarStore((s) => s.isOpen);
  const isCollapsed = useExecutionSidecarStore((s) => s.isCollapsed);
  const width = useExecutionSidecarStore((s) => s.width);
  const activeContext = useExecutionSidecarStore((s) => s.activeContext);
  const userOverrideContext = useExecutionSidecarStore((s) => s.userOverrideContext);
  const setWidth = useExecutionSidecarStore((s) => s.setWidth);
  const expand = useExecutionSidecarStore((s) => s.expand);

  // Auto-detect context
  useExecutionSidecarContext();

  if (!isOpen) {
    return null;
  }

  const displayedContext = userOverrideContext ?? activeContext;

  // Collapsed state: thin strip
  if (isCollapsed) {
    return (
      <div
        className="bg-[#0b0c14] border-l border-white/10 flex flex-col items-center py-3 gap-2 shrink-0 transition-all duration-300 ease-in-out"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={expand}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          aria-label="Expand execution sidecar"
          title="Expand execution panel"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {/* Vertical label */}
        <span
          className="text-[9px] font-medium text-muted-foreground/60 writing-mode-vertical"
          style={{ writingMode: 'vertical-lr', textOrientation: 'mixed' }}
        >
          Execution
        </span>
      </div>
    );
  }

  // Full panel
  return (
    <div
      className={cn(
        'bg-[#0b0c14] border-l border-white/10 shadow-2xl flex flex-col shrink-0',
        'transition-all duration-300 ease-in-out',
      )}
      style={{ width }}
    >
      {/* Resize handle on left edge */}
      <ResizeHandle
        direction="left"
        width={width}
        minWidth={280}
        maxWidth={600}
        onResize={setWidth}
        className="z-50"
      />

      {/* Header with tabs */}
      <ExecutionSidecarHeader />

      {/* Active context view */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ContextView context={displayedContext} />
      </div>

      {/* Filmstrip at bottom */}
      <ExecutionSidecarFilmstrip />
    </div>
  );
}
