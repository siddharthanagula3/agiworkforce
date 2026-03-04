import { Zap, CheckCircle2, Loader2, AlertCircle, Tag } from 'lucide-react';
import type { ToolResultProps } from './index';
import { cn } from '@/lib/utils';

interface SkillData {
  name?: string;
  category?: string;
  description?: string;
  requirements?: string[];
  status?: 'idle' | 'invoking' | 'completed' | 'error';
}

const STATUS_CONFIG = {
  idle: { label: 'Ready', color: 'text-zinc-400', dot: 'bg-zinc-500' },
  invoking: { label: 'Invoking...', color: 'text-blue-400', dot: 'bg-blue-400 animate-pulse' },
  completed: { label: 'Completed', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  error: { label: 'Error', color: 'text-red-400', dot: 'bg-red-400' },
};

export function InlineSkillCard({ result, status }: ToolResultProps) {
  const data = result?.data as SkillData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Loading skill...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Skill invocation failed</p>
          {result?.error && <p className="text-xs text-zinc-500 mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    name = 'Unknown Skill',
    category,
    description,
    requirements = [],
    status: skillStatus = 'idle',
  } = data;

  const statusCfg = STATUS_CONFIG[skillStatus] ?? STATUS_CONFIG.idle;

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800/60 border-b border-white/10">
        <Zap className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-sm font-medium text-zinc-200 flex-1 truncate">{name}</span>
        {category && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400">
            <Tag className="h-2.5 w-2.5" />
            {category}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {description && <p className="text-xs text-zinc-400 line-clamp-2">{description}</p>}

        {requirements.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 font-medium">Requirements</p>
            <ul className="space-y-0.5">
              {requirements.map((req, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                  {req}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-1.5 pt-1">
          <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg.dot)} />
          <span className={cn('text-xs font-medium', statusCfg.color)}>{statusCfg.label}</span>
        </div>
      </div>
    </div>
  );
}
