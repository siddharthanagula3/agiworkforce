'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import {
  DESIGN_FORMATS,
  DESIGN_STYLES,
  EMPTY_BRIEF,
  isBriefReady,
  type DesignBrief,
} from './design-brief';

const FIELD =
  'w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function DesignBriefDialog({
  open,
  onOpenChange,
  initial = EMPTY_BRIEF,
  heading,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: DesignBrief;
  heading: string;
  submitLabel: string;
  onSubmit: (brief: DesignBrief) => boolean;
}) {
  const [brief, setBrief] = useState<DesignBrief>(initial);
  const id = useId();

  useEffect(() => {
    if (open) setBrief(initial);
  }, [open, initial]);

  const set = (key: keyof DesignBrief, value: string) =>
    setBrief((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isBriefReady(brief)) return;
    if (onSubmit(brief)) onOpenChange(false);
  };

  const toggleStyle = (style: string) => {
    const chosen = brief.style
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const next = chosen.includes(style)
      ? chosen.filter((entry) => entry !== style)
      : [...chosen, style];
    set('style', next.join(', '));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="design-brief-dialog">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            The brief is kept with the design, so later changes can be checked against it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label
            htmlFor={`${id}-format`}
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            What you are designing
            <select
              id={`${id}-format`}
              value={brief.format}
              onChange={(event) => set('format', event.target.value)}
              className={cn(FIELD, 'min-h-11 sm:min-h-9')}
            >
              {DESIGN_FORMATS.map((format) => (
                <option key={format}>{format}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Goal
            <textarea
              rows={2}
              required
              value={brief.goal}
              onChange={(event) => set('goal', event.target.value)}
              placeholder="What should this design achieve?"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Audience
            <input
              value={brief.audience}
              onChange={(event) => set('audience', event.target.value)}
              placeholder="Who will see it?"
              className={cn(FIELD, 'min-h-11 sm:min-h-9')}
            />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs text-muted-foreground">Style</legend>
            <div className="flex flex-wrap gap-1.5">
              {DESIGN_STYLES.map((style) => {
                const active = brief.style
                  .split(',')
                  .map((entry) => entry.trim())
                  .includes(style);
                return (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleStyle(style)}
                    className={cn(
                      'min-h-11 rounded-full border px-3 text-sm sm:min-h-8',
                      active
                        ? 'border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)] text-foreground'
                        : 'border-border/60 text-muted-foreground',
                    )}
                  >
                    {style}
                  </button>
                );
              })}
            </div>
            <input
              aria-label="Style notes"
              value={brief.style}
              onChange={(event) => set('style', event.target.value)}
              placeholder="Or describe it: colours, references, mood"
              className={cn(FIELD, 'min-h-11 sm:min-h-9')}
            />
          </fieldset>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Content to include
            <textarea
              rows={3}
              value={brief.content}
              onChange={(event) => set('content', event.target.value)}
              placeholder="Headlines, sections, copy, data"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Layout
            <input
              value={brief.layout}
              onChange={(event) => set('layout', event.target.value)}
              placeholder="Single column, hero then three sections, mobile first"
              className={cn(FIELD, 'min-h-11 sm:min-h-9')}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isBriefReady(brief)} data-testid="design-brief-submit">
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
