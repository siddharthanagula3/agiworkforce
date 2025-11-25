import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Braces,
  FileText,
  MousePointerClick,
  PanelTopOpen,
  Terminal,
  Wand2,
} from 'lucide-react';
import React, { useMemo } from 'react';

import { SidecarMode, useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { ArtifactRenderer } from './ArtifactRenderer';
import { Button } from '../ui/Button';
import { MessageBubble } from './MessageBubble';

interface ChatStreamProps {
  onOpenSidecar?: (panel: SidecarMode, payload?: Record<string, unknown>) => void;
}

const card =
  'rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)]';

export const ChatStream: React.FC<ChatStreamProps> = ({ onOpenSidecar }) => {
  const messages = useUnifiedChatStore((state) => state.messages);
  const agentStatus = useUnifiedChatStore((state) => state.agentStatus);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);
  const isStreaming = useUnifiedChatStore((state) => state.isStreaming);
  const startEditingMessage = useUnifiedChatStore((state) => state.startEditingMessage);

  const items = useMemo(() => messages ?? [], [messages]);

  const handleRetry = (id: string, content: string) => {
    startEditingMessage(id, content);
  };

  const renderThought = (messageId: string, title: string, body: string) => (
    <details className={card} key={messageId} open>
      <summary className="flex items-center gap-2 cursor-pointer text-sm text-zinc-200">
        <Wand2 className="h-4 w-4 text-indigo-300" />
        {title}
      </summary>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200/90">{body}</p>
    </details>
  );

  const renderActionCard = (
    messageId: string,
    label: string,
    body: string,
    panel: SidecarMode,
    payload?: Record<string, unknown>,
  ) => (
    <div className={card} key={messageId}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-zinc-200">
          {panel === 'terminal' && <Terminal className="h-4 w-4 text-emerald-300" />}
          {panel === 'browser' && <MousePointerClick className="h-4 w-4 text-sky-300" />}
          {panel === 'code' && <Braces className="h-4 w-4 text-purple-300" />}
          {panel === 'preview' && <PanelTopOpen className="h-4 w-4 text-orange-300" />}
          {panel === 'diff' && <FileText className="h-4 w-4 text-slate-300" />}
          <span className="font-medium">{label}</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => onOpenSidecar?.(panel, payload)}>
          View output
        </Button>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{body}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence>
        {/* Show thinking indicator when loading (before streaming starts) */}
        {isLoading && !isStreaming ? (
          <motion.div
            key="thinking"
            className="inline-flex items-center gap-2 self-start rounded-full border border-teal-400/50 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-100"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <Wand2 className="h-3 w-3 animate-pulse" />
            Claude is thinking...
          </motion.div>
        ) : agentStatus?.status === 'running' ? (
          <motion.div
            key="live-execution"
            className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <Activity className="h-3 w-3 animate-pulse" />
            Live execution
          </motion.div>
        ) : null}
      </AnimatePresence>

      {items.map((message) => {
        const meta = message.metadata || {};
        const kind: SidecarMode | undefined =
          (meta.sidecarType as SidecarMode | undefined) ||
          (meta.tool === 'terminal'
            ? 'terminal'
            : meta.tool === 'browser'
              ? 'browser'
              : meta.tool === 'code'
                ? 'code'
                : meta.tool === 'media' || meta.tool === 'video'
                  ? 'preview'
                  : meta.tool === 'files'
                    ? 'code'
                    : undefined);

        if (meta.phase === 'thinking' || meta.thinking) {
          return renderThought(
            message.id,
            meta.thinking?.title || 'Planning task...',
            meta.thinking?.details || message.content || 'The agent is reasoning about this task.',
          );
        }

        if (meta.event === 'action' && kind) {
          return renderActionCard(
            message.id,
            meta.label || 'Action executed',
            meta.summary || message.content || 'Agent performed an action.',
            kind,
            { messageId: message.id, ...meta },
          );
        }

        if (kind === 'terminal' && meta.command) {
          return renderActionCard(
            message.id,
            `Executed ${meta.command}`,
            meta.preview || 'Command finished. View output for details.',
            'terminal',
            { command: meta.command, messageId: message.id },
          );
        }

        return (
          <div key={message.id} className="space-y-3">
            <MessageBubble
              message={message}
              showAvatar
              showTimestamp
              enableActions
              onToggleSidecar={(tab) => onOpenSidecar?.(tab)}
              onRegenerate={() => handleRetry(message.id, message.content)}
              onEdit={(content) => handleRetry(message.id, content)}
            />
            {(message.artifacts || (message.metadata as any)?.artifacts)?.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(message.artifacts || (message.metadata as any)?.artifacts || []).map(
                  (artifact: any) => (
                    <ArtifactRenderer key={artifact.id || artifact.title} artifact={artifact} />
                  ),
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default ChatStream;
