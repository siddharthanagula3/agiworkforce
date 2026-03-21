/**
 * ToolRationaleDisplay Component
 *
 * Displays tool selection reasoning including:
 * - Selected tool and rationale
 * - Alternatives considered
 * - Tool capabilities
 */

import React, { memo } from 'react';
import { ChevronDown, ChevronRight, Lightbulb, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ToolRationaleData {
  toolName?: string;
  rationale?: string;
  alternatives?: string[];
  capabilities?: string[];
}

export interface ToolRationaleDisplayProps {
  rationale: ToolRationaleData;
  onDismiss?: () => void;
  className?: string;
}

const ToolRationaleDisplayComponent: React.FC<ToolRationaleDisplayProps> = ({
  rationale,
  onDismiss,
  className,
}) => {
  const [showAlternatives, setShowAlternatives] = React.useState(false);

  if (!rationale.toolName) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 shadow-sm',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <div className="text-sm">
              <span className="text-zinc-400">Selected tool: </span>
              <span className="font-medium text-indigo-300">{rationale.toolName}</span>
            </div>
            {rationale.rationale && (
              <p className="text-xs text-zinc-300 leading-relaxed">{rationale.rationale}</p>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            aria-label="Dismiss rationale"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Capabilities */}
      {rationale.capabilities && rationale.capabilities.length > 0 && (
        <div className="mt-2 pl-6">
          <div className="text-xs text-zinc-400">This tool can:</div>
          <ul className="mt-1 space-y-0.5">
            {rationale.capabilities.slice(0, 3).map((capability, idx) => (
              <li key={idx} className="text-xs text-zinc-300 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-indigo-400" />
                {capability}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Alternatives */}
      {rationale.alternatives && rationale.alternatives.length > 0 && (
        <div className="mt-2 pl-6">
          <button
            type="button"
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-indigo-300 transition-colors"
          >
            {showAlternatives ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Alternatives considered: {rationale.alternatives.join(', ')}
          </button>
        </div>
      )}
    </div>
  );
};

ToolRationaleDisplayComponent.displayName = 'ToolRationaleDisplay';

export const ToolRationaleDisplay = memo(ToolRationaleDisplayComponent);
