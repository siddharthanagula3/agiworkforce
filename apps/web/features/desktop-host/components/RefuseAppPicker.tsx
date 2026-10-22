'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RefusableApplication } from '@agiworkforce/local-runtime-contract';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  cn,
  useCombobox,
} from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { readRefusableApplications } from '../lib/runtime-client';
import { DESKTOP_SETTINGS_BUTTON_CLASS } from './DesktopSettingsRow';

const ADD_APP_LABEL = 'Add app';
const SEARCH_LABEL = 'Search apps';
const LIST_LABEL = 'Installed apps';
const LOADING_LABEL = 'Loading apps';
const NO_MATCH = 'No app matches.';
const NO_APPS = 'Every installed app is already refused.';
const LOAD_FAILED = 'Installed apps could not be read.';

type Listing = { apps: RefusableApplication[] } | { failed: string } | null;

export function RefuseAppPicker({
  refused,
  disabled,
  onPick,
}: {
  refused: ReadonlySet<string>;
  disabled: boolean;
  onPick: (app: RefusableApplication) => void;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [listing, setListing] = useState<Listing>(null);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) return;
    setQuery('');
    setListing(null);
    readRefusableApplications()
      .then((apps) => setListing({ apps }))
      .catch((cause: unknown) => setListing({ failed: toUserMessage(cause, LOAD_FAILED) }));
  }, []);

  const candidates = useMemo(
    () =>
      listing && 'apps' in listing ? listing.apps.filter((app) => !refused.has(app.bundleId)) : [],
    [listing, refused],
  );
  const matches = useMemo(() => {
    const wanted = query.trim().toLocaleLowerCase();
    if (!wanted) return candidates;
    return candidates.filter((app) => app.name.toLocaleLowerCase().includes(wanted));
  }, [candidates, query]);

  const pick = useCallback(
    (app: RefusableApplication) => {
      setOpen(false);
      onPick(app);
    },
    [onPick],
  );

  const { inputProps, getOptionProps, activeItem } = useCombobox({
    items: matches,
    listboxId,
    expanded: open && matches.length > 0,
    getOptionId: (app) => `${listboxId}-${app.bundleId}`,
    onSelect: pick,
    onEscape: () => setOpen(false),
  });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${DESKTOP_SETTINGS_BUTTON_CLASS} inline-flex items-center gap-1`}
          disabled={disabled}
        >
          {ADD_APP_LABEL}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2 p-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={SEARCH_LABEL}
          aria-label={SEARCH_LABEL}
          autoComplete="off"
          className="h-9 w-full rounded-md border border-border bg-transparent px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...inputProps}
        />
        {listing === null ? (
          <div className="flex justify-center py-3">
            <Spinner aria-label={LOADING_LABEL} />
          </div>
        ) : 'failed' in listing ? (
          <p className="px-2.5 py-2 text-sm text-[var(--settings-destructive-text)]" role="alert">
            {listing.failed}
          </p>
        ) : matches.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">
            {candidates.length === 0 ? NO_APPS : NO_MATCH}
          </p>
        ) : (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={LIST_LABEL}
            className="max-h-64 overflow-y-auto"
          >
            {matches.map((app) => (
              <li
                key={app.bundleId}
                {...getOptionProps(app)}
                onClick={() => pick(app)}
                className={cn(
                  'cursor-pointer truncate rounded-md px-2.5 py-2 text-sm text-foreground pointer-coarse:min-h-11',
                  app === activeItem && 'bg-muted',
                )}
              >
                {app.name}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
