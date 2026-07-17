// packages/ui/unified-chat/src/components/InlineToolCallGroup.tsx
//
// Collapsible group header that wraps multiple InlineToolCall rows.
// Matches the Claude pattern:
//   "Used Filesystem integration, loaded tools ▾"
// The header collapses/expands all child tool-call rows beneath.
//
// Usage:
//   <InlineToolCallGroup integrationName="Filesystem" summary="loaded tools">
//     <InlineToolCall id="t1" label="List Directory" status="success" iconStyle="badge" />
//     <InlineToolCall id="t2" label="Read" status="success" iconStyle="badge" />
//   </InlineToolCallGroup>

import { useState, useCallback, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface InlineToolCallGroupProps {
  /**
   * Name of the integration (e.g. "Filesystem", "Brave Search", "Python").
   * Rendered as: "Used {integrationName} integration, {summary} ▾"
   */
  integrationName: string;
  /**
   * Short summary appended after the integration name
   * (e.g. "loaded tools", "10 results", "ran 3 commands").
   */
  summary: string;
  /** Whether the group starts expanded. Defaults to true. */
  defaultOpen?: boolean;
  /** The stacked InlineToolCall rows. */
  children: ReactNode;
  className?: string;
}

export function InlineToolCallGroup({
  integrationName,
  summary,
  defaultOpen = true,
  children,
  className,
}: InlineToolCallGroupProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const bodyId = `itcg-${integrationName.toLowerCase().replace(/\s+/g, '-')}-body`;

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return (
    <div
      className={cn(
        'inline-tool-call-group flex flex-col gap-0.5',
        open && 'inline-tool-call-group--open',
        className,
      )}
      data-integration={integrationName}
    >
      {/* Group header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`Used ${integrationName} integration, ${summary}`}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-tool-call-group__header',
          'flex items-center gap-1.5 select-none',
          'h-7 px-1 rounded-md',
          'cursor-pointer hover:bg-[color:var(--bg-hover,rgba(0,0,0,0.04))]',
          'transition-colors duration-100',
        )}
      >
        <span className="text-sm text-[color:var(--chat-text-muted,#8b8680)] font-normal">
          Used{' '}
          <span className="font-medium text-[color:var(--chat-text-secondary,inherit)]">
            {integrationName}
          </span>{' '}
          integration, {summary}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn(
            'inline-tool-call-group__chevron shrink-0 text-[color:var(--chat-text-muted,#8b8680)]',
            'transition-transform duration-150',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </div>

      {/* Children: stacked tool rows */}
      {open ? (
        <div
          id={bodyId}
          role="region"
          aria-label={`${integrationName} tool calls`}
          className="inline-tool-call-group__body flex flex-col gap-0.5 pl-2"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
