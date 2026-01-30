/**
 * ContextDisplay Component
 *
 * Displays active context items as chips with remove functionality.
 */

import React from 'react';
import { X } from 'lucide-react';
import { ContextItem } from '../../stores/unifiedChatStore';

export interface ContextDisplayProps {
  /** List of active context items */
  items: ContextItem[];
  /** Callback when a context item is removed */
  onRemove: (id: string) => void;
}

export const ContextDisplay: React.FC<ContextDisplayProps> = ({ items, onRemove }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-gray-100 dark:border-gray-700/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Context
        </span>
        {items.map((item) => (
          <div
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 dark:bg-primary/20 px-2.5 py-1 text-xs text-primary dark:text-primary-foreground"
          >
            <span>{item.icon ?? 'CTX'}</span>
            <span className="max-w-[180px] truncate">{item.name}</span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="ml-0.5 text-primary/70 hover:text-primary transition"
              aria-label={`Remove ${item.name} from context`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContextDisplay;
