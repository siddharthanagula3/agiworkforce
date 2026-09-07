'use client';

import { Check } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';

const ROW_CLASS =
  'flex w-full items-center gap-3 rounded-lg py-2 pr-3 text-sm transition-colors hover:bg-muted/60';
const INDENTED_CLASS = 'pl-8';
const FLUSH_CLASS = 'pl-3';
const LOGO_CLASS = 'h-5 w-5 shrink-0 rounded-md border-border shadow-none';
const BOX_CLASS = 'flex h-4 w-4 shrink-0 items-center justify-center rounded border';
const BOX_CHECKED_CLASS = 'border-primary bg-primary text-primary-foreground';
const BOX_UNCHECKED_CLASS = 'border-border';

export interface ConnectorToggleRowProps {
  connector: { id: string; name: string; iconBg: string; iconText: string };
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** The plus menu nests its rows under a parent row; the popover does not. */
  indented?: boolean;
}

/**
 * The one connector toggle in the composer. Both the plus menu submenu and the
 * AGI Work bar popover write the same conversation state, so a switch in one
 * and a checkbox in the other told the user they were two different settings.
 */
export function ConnectorToggleRow({
  connector,
  label,
  checked,
  onToggle,
  indented = false,
}: ConnectorToggleRowProps) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(ROW_CLASS, indented ? INDENTED_CLASS : FLUSH_CLASS)}
    >
      <OfficialConnectorLogo connector={connector} className={LOGO_CLASS} />
      <span className="flex-1 truncate text-left">{label}</span>
      <span
        aria-hidden="true"
        className={cn(BOX_CLASS, checked ? BOX_CHECKED_CLASS : BOX_UNCHECKED_CLASS)}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}
