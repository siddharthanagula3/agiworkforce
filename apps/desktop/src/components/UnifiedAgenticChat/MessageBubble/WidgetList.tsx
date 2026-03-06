/**
 * WidgetList Component
 *
 * Renders a list of embedded widgets for a message (INT-001 integration).
 */

import React, { memo, useCallback } from 'react';
import { emit, isTauri } from '../../../lib/tauri-mock';
import { WidgetRenderer, WidgetActionEvent } from '../Widgets';

export interface WidgetData {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface WidgetListProps {
  messageId: string;
  widgets: WidgetData[];
  isAssistant: boolean;
  isStreaming: boolean;
}

const WidgetListComponent: React.FC<WidgetListProps> = ({
  messageId,
  widgets,
  isAssistant,
  isStreaming,
}) => {
  const handleWidgetAction = useCallback(
    (event: WidgetActionEvent) => {
      console.debug('[WidgetList] Widget action:', event);
      // Emit widget action event for handling by chat system
      if (isTauri) {
        emit('widget:action', {
          messageId,
          ...event,
        });
      }
    },
    [messageId],
  );

  if (!widgets || widgets.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      {widgets.map((widget) => (
        <WidgetRenderer
          key={widget.id}
          widget={widget}
          messageId={messageId}
          onAction={handleWidgetAction}
          readOnly={!isAssistant || isStreaming}
        />
      ))}
    </div>
  );
};

WidgetListComponent.displayName = 'WidgetList';

export const WidgetList = memo(WidgetListComponent);
