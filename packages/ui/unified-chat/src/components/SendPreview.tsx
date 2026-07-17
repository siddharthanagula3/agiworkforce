/**
 * SendPreview — surface-agnostic "what will be sent" disclosure card.
 *
 * Closes the PLAN.md section 5 task: "Add visible 'what will be sent'
 * previews for cloud/BYOK turns." Hosts build a `SendPreviewPresentation`
 * via `summarizeSendPreview` (from `@agiworkforce/types`) and pass it in.
 *
 * The card surfaces the destination (local device / BYOK provider host /
 * Managed gateway), the privacy short label, the model, and an
 * expand/collapse details block (message size, attachments, system-prompt
 * size, context-budget estimate, tools). It is intentionally privacy-
 * positive for Local turns — the banner copy makes the local-only
 * guarantee explicit rather than re-using the cloud-mode "destination"
 * framing.
 *
 * Round-8 autonomous suite-transformation slice, 2026-05-21.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Cloud, HardDrive, KeyRound, Lock } from 'lucide-react';
import type { SendPreviewPresentation } from '@agiworkforce/types';
import { cn } from '../lib/utils';

export interface SendPreviewProps {
  presentation: SendPreviewPresentation;
  /** Initial expanded state for the details block; defaults to collapsed. */
  defaultExpanded?: boolean;
  /** Optional class for host-layout integration. */
  className?: string;
}

function DestinationIcon({ presentation }: { presentation: SendPreviewPresentation }) {
  if (presentation.staysLocal) {
    return <HardDrive className="h-4 w-4 text-emerald-400" aria-hidden />;
  }
  if (presentation.providerMode === 'DirectByok') {
    return <KeyRound className="h-4 w-4 text-amber-300" aria-hidden />;
  }
  return <Cloud className="h-4 w-4 text-sky-300" aria-hidden />;
}

export function SendPreview({
  presentation,
  defaultExpanded = false,
  className,
}: SendPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const detailsAvailable = Boolean(
    presentation.bodyCharLabel ||
    presentation.attachmentLabel ||
    presentation.systemPromptLabel ||
    presentation.contextLabel ||
    presentation.toolsLabel ||
    presentation.sourceSessionLabel,
  );

  const accentClass = presentation.staysLocal
    ? 'border-emerald-500/30 bg-emerald-500/5'
    : presentation.providerMode === 'DirectByok'
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-sky-500/30 bg-sky-500/5';

  return (
    <div
      data-testid="send-preview"
      data-provider-mode={presentation.providerMode}
      data-stays-local={presentation.staysLocal ? 'true' : 'false'}
      className={cn(
        'flex flex-col gap-2 rounded-[var(--chat-radius-md)] border px-3 py-2 text-xs',
        accentClass,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <DestinationIcon presentation={presentation} />
        <span className="font-medium text-[var(--chat-text-primary)]">
          {presentation.destinationLabel}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--chat-text-secondary)]">
          <Lock className="h-3 w-3" aria-hidden />
          {presentation.privacyShortLabel}
        </span>
        {presentation.modelLabel ? (
          <span className="ml-auto text-[10px] text-[var(--chat-text-muted)]">
            {presentation.modelLabel}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--chat-text-secondary)]">
        {presentation.bannerCopy}
      </p>
      {detailsAvailable ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="send-preview-details"
          className="inline-flex items-center gap-1 self-start text-[10px] font-medium uppercase tracking-wide text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)]"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden />
              Hide details
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden />
              Show details
            </>
          )}
        </button>
      ) : null}
      {expanded && detailsAvailable ? (
        <dl
          id="send-preview-details"
          data-testid="send-preview-details"
          className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-[var(--chat-text-secondary)]"
        >
          {presentation.bodyCharLabel ? (
            <DetailRow term="Message" definition={presentation.bodyCharLabel} />
          ) : null}
          {presentation.attachmentLabel ? (
            <DetailRow term="Attachments" definition={presentation.attachmentLabel} />
          ) : null}
          {presentation.systemPromptLabel ? (
            <DetailRow term="System prompt" definition={presentation.systemPromptLabel} />
          ) : null}
          {presentation.contextLabel ? (
            <DetailRow term="Context budget" definition={presentation.contextLabel} />
          ) : null}
          {presentation.toolsLabel ? (
            <DetailRow term="Tools" definition={presentation.toolsLabel} />
          ) : null}
          {presentation.sourceSessionLabel ? (
            <DetailRow term="Source session" definition={presentation.sourceSessionLabel} />
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

function DetailRow({ term, definition }: { term: string; definition: string }) {
  return (
    <>
      <dt className="text-[var(--chat-text-muted)]">{term}</dt>
      <dd className="truncate">{definition}</dd>
    </>
  );
}
