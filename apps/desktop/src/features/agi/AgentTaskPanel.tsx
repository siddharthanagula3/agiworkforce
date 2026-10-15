import { Activity, CalendarClock, ListTodo, Moon, PlusCircle, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/utils';
import { useAgentTaskStore } from '../../stores/agentTaskStore';
import { useBackgroundAgentStore } from '../../stores/backgroundAgentStore';
import { useSchedulerStore } from '../../stores/schedulerStore';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { ScheduledTasksPanel } from '@/features/scheduler/ScheduledTasksPanel';
import { AgentStatusMonitor } from '@/features/agent-status-monitor';
import { AgentTaskCreator } from './AgentTaskCreator';
import { AgentTaskMonitor } from './AgentTaskMonitor';
import { BackgroundAgentsPanel } from './BackgroundAgentsPanel';
import { useNotificationTargetStore } from '../notifications/notificationTarget';

type Tab = 'create' | 'monitor' | 'scheduled' | 'agents' | 'background';

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'create', label: 'Create', icon: PlusCircle },
  { id: 'monitor', label: 'Monitor', icon: ListTodo },
  { id: 'scheduled', label: 'Scheduled', icon: CalendarClock },
  { id: 'agents', label: 'Agents', icon: Activity },
  { id: 'background', label: 'Background', icon: Moon },
];

const tabId = (tab: Tab) => `agent-task-tab-${tab}`;
const TAB_PANEL_ID = 'agent-task-tabpanel';

function tabIndexForKey(key: string, index: number): number | null {
  const last = TABS.length - 1;
  switch (key) {
    case 'ArrowRight':
      return index === last ? 0 : index + 1;
    case 'ArrowLeft':
      return index === 0 ? last : index - 1;
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

export function AgentTaskPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const taskCount = useAgentTaskStore((s) => s.tasks.length);
  const agentStatuses = useUnifiedChatStore((s) => s.agents ?? []);
  const backgroundActiveCount = useBackgroundAgentStore((s) => s.activeCount);
  const scheduledCount = useSchedulerStore(
    (s) => s.tasks.filter((t) => t.status === 'active').length,
  );

  const backgroundAgentRequested = useNotificationTargetStore(
    (s) => s.pending?.kind === 'background-agent',
  );

  useEffect(() => {
    if (backgroundAgentRequested) setActiveTab('background');
  }, [backgroundAgentRequested]);

  const handleTaskCreated = useCallback(() => {
    setActiveTab('monitor');
  }, []);

  const counts: Record<Tab, number> = {
    create: 0,
    monitor: taskCount,
    scheduled: scheduledCount,
    agents: agentStatuses.length,
    background: backgroundActiveCount,
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = tabIndexForKey(event.key, index);
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex]!.id;
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Tasks" className="flex border-b border-white/10">
        {TABS.map(({ id, label, icon: Icon }, index) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              ref={(element) => {
                tabRefs.current[id] = element;
              }}
              type="button"
              role="tab"
              id={tabId(id)}
              aria-selected={selected}
              aria-controls={TAB_PANEL_ID}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                selected
                  ? 'border-b-2 border-teal-500 text-teal-400'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
              {counts[id] > 0 && ` (${counts[id]})`}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={TAB_PANEL_ID}
        aria-labelledby={tabId(activeTab)}
        tabIndex={0}
        className="flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {activeTab === 'create' ? (
          <AgentTaskCreator onTaskCreated={handleTaskCreated} />
        ) : activeTab === 'monitor' ? (
          <AgentTaskMonitor />
        ) : activeTab === 'scheduled' ? (
          <ScheduledTasksPanel />
        ) : activeTab === 'background' ? (
          <BackgroundAgentsPanel />
        ) : (
          <AgentStatusMonitor agents={agentStatuses} />
        )}
      </div>
    </div>
  );
}
