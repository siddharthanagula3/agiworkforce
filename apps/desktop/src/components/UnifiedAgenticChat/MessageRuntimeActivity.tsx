import { memo } from 'react';
import { cn } from '../../lib/utils';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolTimeline } from './ToolTimeline';
import { ActionLogTimelineContent } from './ActionLogTimeline';
import { MessageApprovalsContent } from './MessageApprovals';
import { StatusTrailContent } from './StatusTrail';
import { useMessageRuntimeActivity } from './useMessageRuntimeActivity';

interface MessageRuntimeInlineActivityProps {
  messageId: string;
  className?: string;
}

export const MessageRuntimeInlineActivity = memo(function MessageRuntimeInlineActivity({
  messageId,
  className,
}: MessageRuntimeInlineActivityProps) {
  const activity = useMessageRuntimeActivity(messageId);

  if (
    activity.actionTrail.length === 0 &&
    activity.actionLog.length === 0 &&
    activity.approvals.length === 0
  ) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <StatusTrailContent actionTrail={activity.actionTrail} />
      <ActionLogTimelineContent entries={activity.actionLog} />
      <MessageApprovalsContent approvals={activity.approvals} />
    </div>
  );
});

interface MessageRuntimeDecoratorsProps {
  messageId: string;
  isStreaming: boolean;
  className?: string;
}

export const MessageRuntimeDecorators = memo(function MessageRuntimeDecorators({
  messageId,
  isStreaming,
  className,
}: MessageRuntimeDecoratorsProps) {
  const activity = useMessageRuntimeActivity(messageId);

  if (activity.toolTimeline.length === 0 && !activity.thinkingContent) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {activity.toolTimeline.length > 0 && <ToolTimeline entries={activity.toolTimeline} />}
      {activity.thinkingContent && (
        <ThinkingBlock content={activity.thinkingContent} isStreaming={isStreaming} />
      )}
    </div>
  );
});
