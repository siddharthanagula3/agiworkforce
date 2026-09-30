import { Users } from 'lucide-react';
import {
  TrustBadge,
  resolveProjectIcon,
  resolveProjectAccentHex,
  hasKnownProjectIcon,
} from '@agiworkforce/ui';
import { providerModeToPrivacyMode, type ProjectHeaderPresentation } from '@agiworkforce/types';
import { cn } from '../lib/utils';

export interface ProjectHeaderProps {
  presentation: ProjectHeaderPresentation;
  className?: string;
  compact?: boolean;
}

function IconCircle({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const accent = resolveProjectAccentHex(presentation.accentColor);
  const Icon = resolveProjectIcon(
    hasKnownProjectIcon(presentation.iconEmoji) ? presentation.iconEmoji : null,
  );
  return (
    <div
      aria-hidden
      style={{
        color: accent,
        backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
      }}
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border',
        'text-muted-foreground',
      )}
    >
      <Icon className="h-6 w-6" />
    </div>
  );
}

function PrivacyChip({ presentation }: { presentation: ProjectHeaderPresentation }) {
  return (
    <TrustBadge
      data-testid="project-header-privacy-chip"
      data-stays-local={presentation.staysLocal ? 'true' : 'false'}
      boundary={presentation.privacyMode}
      label={presentation.privacyLabel}
    />
  );
}

function ProviderChip({ presentation }: { presentation: ProjectHeaderPresentation }) {
  return (
    <TrustBadge
      data-testid="project-header-provider-chip"
      data-provider-mode={presentation.providerMode}
      boundary={providerModeToPrivacyMode(presentation.providerMode)}
      label={presentation.providerLabel}
      showIcon={false}
    />
  );
}

function MetaRow({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const items = [
    presentation.knowledgeFileCountLabel,
    presentation.memberCountLabel,
    presentation.lastUsedLabel,
    presentation.defaultModelLabel ? `Default model: ${presentation.defaultModelLabel}` : undefined,
  ].filter((value): value is string => Boolean(value));

  if (items.length === 0) return null;

  return (
    <div
      data-testid="project-header-meta-row"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-[var(--chat-text-muted)]"
    >
      {items.map((item, index) => (
        <span key={item + index} className="inline-flex items-center gap-1">
          {item.startsWith('Default model:') ? null : index === 0 ? (
            <Users className="h-3 w-3" aria-hidden />
          ) : null}
          {item}
        </span>
      ))}
    </div>
  );
}

function SurfaceChips({ presentation }: { presentation: ProjectHeaderPresentation }) {
  if (presentation.surfaceChips.length === 0) return null;
  return (
    <div data-testid="project-header-surface-chips" className="flex flex-wrap items-center gap-1">
      {presentation.surfaceChips.map((label) => (
        <span
          key={label}
          className={cn(
            'inline-flex items-center rounded-md border px-1.5 py-0.5 text-caption uppercase tracking-wide',
            'border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] text-[var(--chat-text-secondary)]',
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function ProjectHeader({ presentation, className, compact = false }: ProjectHeaderProps) {
  if (compact && !presentation.description) return null;

  return (
    <div
      data-testid="project-header"
      data-accent-color={presentation.accentColor}
      data-stays-local={presentation.staysLocal ? 'true' : 'false'}
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        'border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
        className,
      )}
    >
      {compact ? (
        presentation.description ? (
          <p className="m-0 line-clamp-2 text-xs text-[var(--chat-text-secondary)]">
            {presentation.description}
          </p>
        ) : null
      ) : (
        <div className="flex items-start gap-3">
          <IconCircle presentation={presentation} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2
                title={presentation.title}
                className="truncate text-h4 text-[var(--chat-text-primary)]"
              >
                {presentation.title}
              </h2>
              {presentation.importedFromLabel ? (
                <span
                  data-testid="project-header-imported-from"
                  className={cn(
                    'inline-flex items-center rounded-full border px-1.5 py-0.5 text-caption uppercase tracking-wide',
                    'border-border bg-muted text-info-text',
                  )}
                >
                  {presentation.importedFromLabel}
                </span>
              ) : null}
            </div>
            {presentation.description ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-[var(--chat-text-secondary)]">
                {presentation.description}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {!compact && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <PrivacyChip presentation={presentation} />
            <ProviderChip presentation={presentation} />
          </div>

          <MetaRow presentation={presentation} />
          <SurfaceChips presentation={presentation} />
        </>
      )}
    </div>
  );
}
