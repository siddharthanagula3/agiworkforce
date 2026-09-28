'use client';

import { memo } from 'react';
import { MessageSquareText, Plug, Sparkles } from '@agiworkforce/icons';
import type { MessageMetadata } from '@shared/stores/web-chat-store';
import { mcpServerLabel } from '@/features/connectors/lib/mcp-tool-name';

const CHIP_CLASS =
  'inline-flex max-w-64 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs text-foreground';
const CHIP_ICON_CLASS = 'h-3.5 w-3.5 shrink-0 text-muted-foreground';

interface MessageContextChipsProps {
  mcpContext?: MessageMetadata['mcpContext'];
  skillName?: string;
}

function MessageContextChipsComponent({ mcpContext, skillName }: MessageContextChipsProps) {
  const prompt = mcpContext?.prompt;
  const resources = mcpContext?.resources ?? [];
  if (!skillName && !prompt && resources.length === 0) return null;

  return (
    <ul
      aria-label="Context sent with this message"
      data-testid="message-context-chips"
      className="mt-2 flex flex-wrap items-center gap-1.5"
    >
      {skillName && (
        <li className={CHIP_CLASS} title={`Skill: ${skillName}`}>
          <Sparkles className={CHIP_ICON_CLASS} aria-hidden="true" />
          <span className="truncate">/{skillName}</span>
        </li>
      )}
      {prompt && (
        <li className={CHIP_CLASS} title={`${mcpServerLabel(prompt.connectorId)}: ${prompt.name}`}>
          <MessageSquareText className={CHIP_ICON_CLASS} aria-hidden="true" />
          <span className="truncate">Prompt: {prompt.name}</span>
          <span className="sr-only">, from {mcpServerLabel(prompt.connectorId)}</span>
        </li>
      )}
      {resources.map((resource) => {
        const label = resource.name ?? resource.uri;
        const connector = mcpServerLabel(resource.connectorId);
        return (
          <li
            key={`${resource.connectorId}:${resource.uri}`}
            className={CHIP_CLASS}
            title={`${connector}: ${label}`}
          >
            <Plug className={CHIP_ICON_CLASS} aria-hidden="true" />
            <span className="truncate">Resource: {label}</span>
            <span className="sr-only">, from {connector}</span>
          </li>
        );
      })}
    </ul>
  );
}

export const MessageContextChips = memo(MessageContextChipsComponent);
MessageContextChips.displayName = 'MessageContextChips';
