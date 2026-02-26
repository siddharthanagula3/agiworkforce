/**
 * InlinePanelList Component
 *
 * Renders a list of inline panels for a message.
 */

import React, { memo } from 'react';
import { InlinePanel } from '@/stores/unified/unifiedChatStore';
import { InlinePanelRenderer } from '../InlinePanels/InlinePanelRenderer';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';

export interface InlinePanelListProps {
  messageId: string;
  panels: InlinePanel[];
}

const InlinePanelListComponent: React.FC<InlinePanelListProps> = ({ messageId, panels }) => {
  if (!panels || panels.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      {panels.map((panel) => (
        <InlinePanelRenderer
          key={panel.id}
          panel={panel}
          messageId={messageId}
          onToggleCollapse={() =>
            useUnifiedChatStore.getState().toggleInlinePanelCollapse(messageId, panel.id)
          }
        />
      ))}
    </div>
  );
};

InlinePanelListComponent.displayName = 'InlinePanelList';

export const InlinePanelList = memo(InlinePanelListComponent);
