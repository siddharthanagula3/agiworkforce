'use client';

import { ArrowUpRight } from 'lucide-react';

import { cn } from '../cn';
import {
  INSTALLED_LABEL,
  INSTALL_LABEL,
  PLUGIN_BY_PREFIX,
  PLUGIN_PROMPTS_LABEL,
  PLUGIN_SOURCE_LABEL,
} from './constants';
import { DirectoryBackLink, DirectoryDetailHeader } from './DirectoryDetailHeader';
import { DIRECTORY_FOCUS_RING } from './styles';
import type { DirectoryPluginDetail } from './types';

export function PluginDetailView({
  detail,
  onBack,
  onInstall,
  onOpenSettings,
  onCopyLink,
  onOpenSource,
  busy,
}: {
  detail: DirectoryPluginDetail;
  onBack: () => void;
  onInstall?: () => void;
  onOpenSettings?: () => void;
  onCopyLink?: () => void;
  onOpenSource?: (href: string) => void;
  busy?: boolean;
}) {
  const sourceUrl = detail.sourceUrl ?? null;
  return (
    <div className="flex flex-col gap-4">
      <DirectoryBackLink onBack={onBack} />
      <DirectoryDetailHeader
        title={detail.name}
        name={detail.name}
        subtitle={
          <span className="flex flex-col gap-1">
            {detail.publisher ? <span>{`${PLUGIN_BY_PREFIX} ${detail.publisher}`}</span> : null}
            {sourceUrl ? (
              <button
                type="button"
                onClick={() => onOpenSource?.(sourceUrl)}
                className={cn(
                  'inline-flex w-fit items-center gap-1 text-sm text-foreground underline underline-offset-4',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                {PLUGIN_SOURCE_LABEL}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </span>
        }
        primaryLabel={detail.installed ? INSTALLED_LABEL : INSTALL_LABEL}
        primaryDone={detail.installed === true}
        onPrimary={detail.installable === false ? undefined : onInstall}
        onOpenSettings={onOpenSettings}
        onCopyLink={onCopyLink}
        busy={busy}
      />

      <p className="text-sm leading-relaxed text-foreground">{detail.description}</p>

      {detail.examplePrompts.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">{PLUGIN_PROMPTS_LABEL}</h4>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
            {detail.examplePrompts.map((prompt) => (
              <li key={prompt} className="bg-card px-3 py-2.5 text-sm text-foreground">
                {prompt}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
