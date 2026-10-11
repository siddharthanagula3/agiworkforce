'use client';

import { Label, RadioGroup, RadioGroupItem } from '@agiworkforce/ui';
import { SITE_VISIBILITY_DESCRIPTIONS } from '../lib/site-format';
import type { SiteVisibility } from '../services/sites-service';

const OPTION_LABELS: Record<SiteVisibility, string> = {
  public: 'Anyone with the link',
  organization: 'Your workspace',
};

export function SiteSharingOptions({
  idPrefix,
  value,
  workspace,
  disabled,
  onChange,
}: {
  idPrefix: string;
  value: SiteVisibility;
  workspace: { memberCount: number } | null;
  disabled?: boolean;
  onChange: (next: SiteVisibility) => void;
}) {
  const options: SiteVisibility[] = ['public', 'organization'];
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next === 'organization' ? 'organization' : 'public')}
      disabled={disabled}
      aria-label="Who can open this site"
      className="grid gap-2"
    >
      {options.map((option) => {
        const unavailable = option === 'organization' && !workspace && value !== 'organization';
        return (
          <Label
            key={option}
            htmlFor={`${idPrefix}-${option}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--chat-border)] px-3 py-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <RadioGroupItem
              id={`${idPrefix}-${option}`}
              value={option}
              disabled={unavailable}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-[var(--chat-text-primary)]">
                {OPTION_LABELS[option]}
              </span>
              <span className="text-sm text-[var(--chat-text-muted)]">
                {unavailable
                  ? 'Join or create a workspace to share with its members only.'
                  : SITE_VISIBILITY_DESCRIPTIONS[option]}
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
