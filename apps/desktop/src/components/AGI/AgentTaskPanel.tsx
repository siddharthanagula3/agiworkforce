import { Activity, CalendarClock, ListTodo, PlusCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '../../lib/utils';
import { useAgentTaskStore } from '../../stores/agentTaskStore';
import { useSchedulerStore } from '../../stores/schedulerStore';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { ScheduledTasksPanel } from '../Scheduler/ScheduledTasksPanel';
import { AgentStatusMonitor } from '../AgentStatusMonitor';
import { AgentTaskCreator } from './AgentTaskCreator';
import { AgentTaskMonitor } from './AgentTaskMonitor';

type Tab = 'create' | 'monitor' | 'scheduled' | 'agents';

export function AgentTaskPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const taskCount = useAgentTaskStore((s) => s.tasks.length);
  const agentStatuses = useUnifiedChatStore((s) => s.agents ?? []);
  const scheduledCount = useSchedulerStore(
    (s) => s.tasks.filter((t) => t.status === 'active').length,
  );

  const handleTaskCreated = useCallback(() => {
    setActiveTab('monitor');
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition',
            activeTab === 'create'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <PlusCircle className="h-4 w-4" />
          Create
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('monitor')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition',
            activeTab === 'monitor'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <ListTodo className="h-4 w-4" />
          Monitor{taskCount > 0 && ` (${taskCount})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scheduled')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition',
            activeTab === 'scheduled'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <CalendarClock className="h-4 w-4" />
          Scheduled{scheduledCount > 0 && ` (${scheduledCount})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('agents')}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition',
            activeTab === 'agents'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Activity className="h-4 w-4" />
          Agents{agentStatuses.length > 0 && ` (${agentStatuses.length})`}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'create' ? (
          <AgentTaskCreator onTaskCreated={handleTaskCreated} />
        ) : activeTab === 'monitor' ? (
          <AgentTaskMonitor />
        ) : activeTab === 'scheduled' ? (
          <ScheduledTasksPanel />
        ) : (
          <AgentStatusMonitor agents={agentStatuses} />
        )}
      </div>
    </div>
  );
}
