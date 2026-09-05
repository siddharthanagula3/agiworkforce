import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Cloud, HardDrive, KeyRound, Lock } from 'lucide-react';
import type { SendPreviewPresentation } from '@agiworkforce/types';
import { cn } from '../lib/utils';

export interface SendPreviewProps {
  presentation: SendPreviewPresentation;
  defaultExpanded?: boolean;
  variant?: 'card' | 'compact';
  className?: string;
}

function DestinationIcon({
  presentation,
  compact = false,
}: {
  presentation: SendPreviewPresentation;
  compact?: boolean;
}) {
  const sizeClass = compact ? 'h-3 w-3' : 'h-4 w-4';
  if (presentation.staysLocal) {
    return <HardDrive className={cn(sizeClass, 'text-emerald-400')} aria-hidden />;
  }
  if (presentation.providerMode === 'DirectByok') {
    return <KeyRound className={cn(sizeClass, 'text-amber-300')} aria-hidden />;
  }
  return <Cloud className={cn(sizeClass, 'text-sky-300')} aria-hidden />;
}

function compactDestinationLabel(presentation: SendPreviewPresentation): string {
  if (presentation.staysLocal) return 'Local';
  if (presentation.providerMode === 'DirectByok') {
    return presentation.destinationLabel.replace(/^Sent to\s+/i, '') || 'BYOK';
  }
  return 'Managed cloud';
}

export function SendPreview({
  presentation,
  defaultExpanded = false,
  variant = 'card',
  className,
}: SendPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const generatedDetailsId = useId();
  const detailsId = variant === 'compact' ? generatedDetailsId : 'send-preview-details';
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

  if (variant === 'compact') {
    return (
      <span
        data-testid="send-preview"
        data-provider-mode={presentation.providerMode}
        data-stays-local={presentation.staysLocal ? 'true' : 'false'}
        className={cn('relative inline-flex shrink-0', className)}
      >
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${presentation.destinationLabel}. ${expanded ? 'Hide' : 'Show'} send details`}
          title={presentation.destinationLabel}
          className="inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-[12px] font-medium text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-overlay)] hover:text-[var(--chat-text-secondary)]"
        >
          <DestinationIcon presentation={presentation} compact />
          {/* Icon-only on a phone. The strip below the composer has to fit one
              line there - chatgpt.com shows one, claude.ai none - and the
              destination is still announced: the button's aria-label and title
              both carry the full label, and expanding it names the destination
              in full. */}
          <span className="hidden sm:inline">{compactDestinationLabel(presentation)}</span>
          {expanded ? (
            <ChevronDown className="h-2.5 w-2.5 rotate-180" aria-hidden />
          ) : (
            <ChevronDown className="h-2.5 w-2.5" aria-hidden />
          )}
        </button>

        {expanded ? (
          <div
            id={detailsId}
            data-testid="send-preview-details"
            className={cn(
              'absolute bottom-full left-1/2 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2',
              'rounded-[var(--chat-radius-md)] border p-3 text-left shadow-xl backdrop-blur-xl',
              'bg-[var(--chat-surface-overlay)]',
              accentClass,
            )}
          >
            <div className="flex items-center gap-2">
              <DestinationIcon presentation={presentation} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--chat-text-primary)]">
                {presentation.destinationLabel}
              </span>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium uppercase tracking-wide text-[var(--chat-text-secondary)]">
                <Lock className="h-3 w-3" aria-hidden />
                {presentation.privacyShortLabel}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--chat-text-secondary)]">
              {presentation.bannerCopy}
            </p>
            {detailsAvailable ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-[var(--chat-text-secondary)]">
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
        ) : null}
      </span>
    );
  }

  return (
    <div
      data-testid="send-preview"
      data-provider-mode={presentation.providerMode}
      data-stays-local={presentation.staysLocal ? 'true' : 'false'}
      className={cn(
        'flex flex-col gap-0.5 rounded-[var(--chat-radius-md)] border px-3 py-1 text-xs',
        accentClass,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <DestinationIcon presentation={presentation} />
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--chat-text-primary)]">
          {presentation.destinationLabel}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-[var(--chat-text-secondary)]">
          <Lock className="h-3 w-3" aria-hidden />
          {presentation.privacyShortLabel}
        </span>
        {presentation.modelLabel ? (
          <span className="ml-auto shrink-0 text-[12px] text-[var(--chat-text-muted)]">
            {presentation.modelLabel}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="inline-flex items-center gap-1 self-start text-[12px] font-medium uppercase tracking-wide text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)]"
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
      {expanded ? (
        <div id={detailsId} data-testid="send-preview-details" className="flex flex-col gap-2">
          <p className="text-[12px] leading-relaxed text-[var(--chat-text-secondary)]">
            {presentation.bannerCopy}
          </p>
          {detailsAvailable ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-[var(--chat-text-secondary)]">
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
