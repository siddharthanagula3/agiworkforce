import { ListTodo, PlusCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cn } from '../../lib/utils';
import { useAgentTaskStore } from '../../stores/agentTaskStore';
import { AgentTaskCreator } from './AgentTaskCreator';
import { AgentTaskMonitor } from './AgentTaskMonitor';

type Tab = 'create' | 'monitor';

export function AgentTaskPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const taskCount = useAgentTaskStore((s) => s.tasks.length);

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
            'flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition',
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
            'flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition',
            activeTab === 'monitor'
              ? 'border-b-2 border-teal-500 text-teal-400'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <ListTodo className="h-4 w-4" />
          Monitor{taskCount > 0 && ` (${taskCount})`}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'create' ? (
          <AgentTaskCreator onTaskCreated={handleTaskCreated} />
        ) : (
          <AgentTaskMonitor />
        )}
      </div>
    </div>
  );
}
