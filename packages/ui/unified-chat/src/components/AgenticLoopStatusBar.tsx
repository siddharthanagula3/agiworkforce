import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAgentLoopStore, selectAgentLoop } from '../stores/agentLoopStore';

export const AgenticLoopStatusBar: React.FC = () => {
  const agentLoop = useAgentLoopStore(selectAgentLoop);

  if (!agentLoop?.active) {
    return null;
  }

  const { iteration, maxIterations } = agentLoop;
  const stepLabel = maxIterations > 0 ? `step ${iteration}/${maxIterations}` : `step ${iteration}`;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-violet-950/40 border-t border-violet-500/20 text-xs text-violet-300"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin shrink-0" aria-hidden="true" />
      <span>
        Agent working ({stepLabel}){' '}
        <span className="text-violet-400/70">, type to queue a follow-up</span>
      </span>
    </div>
  );
};
