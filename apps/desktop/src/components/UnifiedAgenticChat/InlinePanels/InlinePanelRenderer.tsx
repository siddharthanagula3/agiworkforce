/**
 * InlinePanelRenderer Component
 *
 * Router component that renders the appropriate inline panel type
 * based on the panel type.
 */

import React, { memo } from 'react';
import { InlinePanel as InlinePanelType } from '../../../stores/unifiedChatStore';
import { TerminalInlinePanel } from './TerminalInlinePanel';
import { BrowserInlinePanel } from './BrowserInlinePanel';
import { CodeInlinePanel } from './CodeInlinePanel';
import { DatabaseInlinePanel } from './DatabaseInlinePanel';

export interface InlinePanelRendererProps {
  panel: InlinePanelType;
  messageId: string;
  onToggleCollapse: () => void;
}

const InlinePanelRendererComponent: React.FC<InlinePanelRendererProps> = memo(
  ({ panel, messageId, onToggleCollapse }) => {
    switch (panel.type) {
      case 'terminal':
        return (
          <TerminalInlinePanel
            panel={panel}
            messageId={messageId}
            onToggleCollapse={onToggleCollapse}
          />
        );

      case 'browser':
        return (
          <BrowserInlinePanel
            panel={panel}
            messageId={messageId}
            onToggleCollapse={onToggleCollapse}
          />
        );

      case 'code':
        return (
          <CodeInlinePanel
            panel={panel}
            messageId={messageId}
            onToggleCollapse={onToggleCollapse}
          />
        );

      case 'database':
        return (
          <DatabaseInlinePanel
            panel={panel}
            messageId={messageId}
            onToggleCollapse={onToggleCollapse}
          />
        );

      default:
        // Fallback for unknown types
        return (
          <div className="p-4 rounded border border-gray-300 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20">
            <div className="text-sm text-yellow-700 dark:text-yellow-300">
              Unknown panel type: {(panel as { type: string }).type}
            </div>
          </div>
        );
    }
  },
);

InlinePanelRendererComponent.displayName = 'InlinePanelRenderer';

export { InlinePanelRendererComponent as InlinePanelRenderer };
