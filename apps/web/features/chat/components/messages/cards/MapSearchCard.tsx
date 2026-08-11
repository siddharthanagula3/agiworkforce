'use client';

import { ExternalLink, MapPinned } from 'lucide-react';
import type { InteractiveCardRenderContext, MapSearchCardBody } from '@agiworkforce/types';

interface MapSearchCardProps {
  body: MapSearchCardBody;
  ctx: InteractiveCardRenderContext;
}

export function MapSearchCard({ body, ctx }: MapSearchCardProps) {
  return (
    <section
      aria-label={body.title}
      data-testid="interactive-card-map-search"
      className="my-3 overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] shadow-sm"
    >
      <div className="relative flex min-h-28 items-end overflow-hidden bg-[radial-gradient(circle_at_20%_30%,color-mix(in_srgb,hsl(var(--primary))_18%,transparent)_0_2px,transparent_3px),linear-gradient(120deg,color-mix(in_srgb,hsl(var(--muted))_82%,transparent),color-mix(in_srgb,hsl(var(--background))_92%,transparent))] p-4">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(var(--chat-border)_1px,transparent_1px),linear-gradient(90deg,var(--chat-border)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <MapPinned className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold text-foreground">{body.title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{body.query}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {body.actions.map((action) => (
          <button
            key={action.provider}
            type="button"
            onClick={() => ctx.onOpenUrl?.(action.url)}
            disabled={!ctx.onOpenUrl}
            className="inline-flex min-h-10 items-center justify-between gap-3 rounded-xl border border-[var(--chat-border)] bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{action.label}</span>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        Opens a provider search. Confirm the place before navigating.
      </p>
    </section>
  );
}
