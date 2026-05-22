/**
 * ProjectHeader — surface-agnostic header card for a project.
 *
 * Closes the host-adoption side of the PLAN.md section 5 "Define project
 * schema" task. Hosts build a `ProjectHeaderPresentation` via
 * `summarizeProjectHeader` (from `@agiworkforce/types`) and pass it in.
 *
 * The header surfaces the project's identity (icon, name, description),
 * trust posture (privacy + provider chips, with explicit "Local" framing
 * when `staysLocal`), default model, denormalized counts (knowledge files,
 * members), last-used label, imported-from chip, and the set of allowed
 * surfaces — in the canonical order produced by `summarizeProjectHeader`.
 *
 * The shared `ProjectHeaderPresentation` accent palette is intentionally
 * bounded (emerald / sky / amber / rose / violet / zinc) so this component
 * can map every value to a deterministic Tailwind class set without
 * leaking arbitrary `style={{ backgroundColor }}` values into the DOM.
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import { Folder, KeyRound, Lock, Users } from 'lucide-react';
import type { ProjectAccentColor, ProjectHeaderPresentation } from '@agiworkforce/types';
import { cn } from '../lib/utils';

export interface ProjectHeaderProps {
  presentation: ProjectHeaderPresentation;
  /** Optional class for host-layout integration. */
  className?: string;
}

const ACCENT_BG: Record<ProjectAccentColor, string> = {
  emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  sky: 'bg-sky-500/15 border-sky-500/30 text-sky-300',
  amber: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  rose: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
  violet: 'bg-violet-500/15 border-violet-500/30 text-violet-300',
  zinc: 'bg-zinc-500/15 border-zinc-500/30 text-zinc-300',
};

const PROVIDER_CHIP: Record<string, string> = {
  Local: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/5',
  DirectByok: 'border-amber-500/40 text-amber-300 bg-amber-500/5',
  ManagedGateway: 'border-sky-500/40 text-sky-300 bg-sky-500/5',
  ManagedNative: 'border-sky-500/40 text-sky-300 bg-sky-500/5',
};

function IconCircle({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const accent = ACCENT_BG[presentation.accentColor];
  return (
    <div
      aria-hidden
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl',
        accent,
      )}
    >
      {presentation.iconEmoji ?? <Folder className="h-6 w-6" />}
    </div>
  );
}

function PrivacyChip({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const Icon = presentation.staysLocal ? Lock : KeyRound;
  return (
    <span
      data-testid="project-header-privacy-chip"
      data-stays-local={presentation.staysLocal ? 'true' : 'false'}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        presentation.staysLocal
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-200',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span>{presentation.privacyLabel}</span>
    </span>
  );
}

function ProviderChip({ presentation }: { presentation: ProjectHeaderPresentation }) {
  const tone = PROVIDER_CHIP[presentation.providerMode] ?? PROVIDER_CHIP['Local'];
  return (
    <span
      data-testid="project-header-provider-chip"
      data-provider-mode={presentation.providerMode}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone,
      )}
    >
      {presentation.providerLabel}
    </span>
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
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--chat-text-muted)]"
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
            'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
            'border-[var(--chat-border)] bg-[var(--chat-surface-overlay)] text-[var(--chat-text-secondary)]',
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function ProjectHeader({ presentation, className }: ProjectHeaderProps) {
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
      <div className="flex items-start gap-3">
        <IconCircle presentation={presentation} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-[var(--chat-text-primary)]">
              {presentation.title}
            </h2>
            {presentation.importedFromLabel ? (
              <span
                data-testid="project-header-imported-from"
                className={cn(
                  'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                  'border-violet-500/40 bg-violet-500/10 text-violet-300',
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

      <div className="flex flex-wrap items-center gap-1.5">
        <PrivacyChip presentation={presentation} />
        <ProviderChip presentation={presentation} />
      </div>

      <MetaRow presentation={presentation} />
      <SurfaceChips presentation={presentation} />
    </div>
  );
}
