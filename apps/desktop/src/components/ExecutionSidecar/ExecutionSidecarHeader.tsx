import { useCallback } from 'react';
import { ChevronRight, X, ListOrdered, Monitor, Globe, Terminal, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExecutionSidecarStore, type SidecarContext } from '../../stores/executionSidecarStore';
import { useChatStore } from '../../stores/chat/chatStore';
import { useToolStore } from '../../stores/chat/toolStore';

interface TabDef {
  id: SidecarContext;
  label: string;
  Icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'timeline', label: 'Timeline', Icon: ListOrdered },
  { id: 'screenshot', label: 'Screen', Icon: Monitor },
  { id: 'browser', label: 'Browser', Icon: Globe },
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'approval', label: 'Approvals', Icon: ShieldCheck },
];

export function ExecutionSidecarHeader() {
  const activeContext = useExecutionSidecarStore((s) => s.activeContext);
  const userOverrideContext = useExecutionSidecarStore((s) => s.userOverrideContext);
  const setUserOverrideContext = useExecutionSidecarStore((s) => s.setUserOverrideContext);
  const collapse = useExecutionSidecarStore((s) => s.collapse);
  const close = useExecutionSidecarStore((s) => s.close);

  const agenticLoopStatus = useChatStore((s) => s.agenticLoopStatus);
  const pendingApprovals = useToolStore((s) => s.pendingApprovals);

  const iterationLabel =
    agenticLoopStatus?.active && agenticLoopStatus.maxIterations > 0
      ? `Step ${agenticLoopStatus.iteration + 1}/${agenticLoopStatus.maxIterations}`
      : null;

  const pendingCount = pendingApprovals.length;

  const handleTabClick = useCallback(
    (tabId: SidecarContext) => {
      setUserOverrideContext(tabId);
    },
    [setUserOverrideContext],
  );

  const handleTabDoubleClick = useCallback(() => {
    setUserOverrideContext(null);
  }, [setUserOverrideContext]);

  const displayedContext = userOverrideContext ?? activeContext;

  return (
    <div className="flex flex-col border-b border-white/10 shrink-0">
      {/* Title row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground/90">Execution</span>
          {iterationLabel && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300">
              {iterationLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={collapse}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            aria-label="Collapse sidecar"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={close}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            aria-label="Close sidecar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs row */}
      <div className="flex items-center gap-0.5 px-2 pb-1.5">
        {TABS.map((tab) => {
          const isActive = displayedContext === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              onDoubleClick={handleTabDoubleClick}
              className={cn(
                'relative flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                isActive
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
              title={`${tab.label}${tab.id === 'approval' && pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            >
              <tab.Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.id === 'approval' && pendingCount > 0 && (
                <span className="ml-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
