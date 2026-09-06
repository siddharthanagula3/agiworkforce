'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, Plug, Search } from '@agiworkforce/icons';
import { Popover, PopoverContent, PopoverTrigger, Spinner, Switch } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { buildSettingsBrowseHash } from '@/features/directory';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import type { ComposerPlusMenuConnector } from './ComposerPlusMenu';

export const COMPOSER_PLUGINS_MENU_TESTID = 'composer-plugins-menu';
export const COMPOSER_PLUGINS_SEARCH_LABEL = 'Search plugins';
export const COMPOSER_PLUGINS_CONNECT_LABEL = 'Connect plugins';
export const COMPOSER_PLUGINS_EMPTY_COPY = 'No plugins are connected yet.';

const MENU_LABEL = 'Plugins';
const NO_MATCH_COPY = 'No connected plugin matches that search.';
const LOADING_LABEL = 'Loading plugins';
const TOGGLE_LABEL_PREFIX = 'Use';
const SETTINGS_SECTION = 'connectors';
const TOGGLE_ID_PREFIX = 'composer-plugin';

const PANEL_CLASS = 'w-[min(20rem,calc(100vw-1rem))] rounded-xl p-1.5';
const SEARCH_WRAP_CLASS = 'relative px-1 pb-1.5 pt-1';
const SEARCH_INPUT_CLASS =
  'h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ROW_CLASS = 'flex min-h-10 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm';
const ROW_BUTTON_CLASS =
  'text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const LOGO_CLASS = 'h-6 w-6 rounded-md border-border shadow-none';
const SWITCH_CLASS =
  'h-5 min-h-0 w-9 min-w-0 [&>span]:size-4 [&>span]:data-[state=checked]:translate-x-4';
const DIVIDER_CLASS = 'my-1 border-t border-border';
const NOTE_CLASS = 'px-2 py-3 text-center text-xs text-muted-foreground';

export interface ComposerPluginsMenuProps {
  children: ReactNode;
  connectors: readonly ComposerPlusMenuConnector[];
  loading?: boolean;
  disabledConnectorIds: readonly string[];
  onSetConnectorEnabled: (connectorId: string, enabled: boolean) => void;
  onBrowse?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function matchesQuery(connector: ComposerPlusMenuConnector, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${connector.label} ${connector.description ?? ''}`.toLowerCase().includes(needle);
}

export function ComposerPluginsMenu({
  children,
  connectors,
  loading = false,
  disabledConnectorIds,
  onSetConnectorEnabled,
  onBrowse,
  open,
  onOpenChange,
}: ComposerPluginsMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { openSettings } = useSettingsModal();
  const isOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (!next) setQuery('');
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const visible = useMemo(
    () => connectors.filter((connector) => matchesQuery(connector, query)),
    [connectors, query],
  );

  const browse = () => {
    setOpen(false);
    if (onBrowse) {
      onBrowse();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.hash = buildSettingsBrowseHash(SETTINGS_SECTION);
    }
    openSettings(SETTINGS_SECTION);
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        aria-label={MENU_LABEL}
        data-testid={COMPOSER_PLUGINS_MENU_TESTID}
        className={PANEL_CLASS}
      >
        {connectors.length > 0 ? (
          <div className={SEARCH_WRAP_CLASS}>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={COMPOSER_PLUGINS_SEARCH_LABEL}
              aria-label={COMPOSER_PLUGINS_SEARCH_LABEL}
              className={SEARCH_INPUT_CLASS}
            />
          </div>
        ) : null}

        {loading && connectors.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Spinner size="sm" aria-label={LOADING_LABEL} />
            {LOADING_LABEL}
          </div>
        ) : connectors.length === 0 ? (
          <p className={NOTE_CLASS}>{COMPOSER_PLUGINS_EMPTY_COPY}</p>
        ) : visible.length === 0 ? (
          <p className={NOTE_CLASS}>{NO_MATCH_COPY}</p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((connector) => {
              const enabled = !disabledConnectorIds.includes(connector.id);
              const switchId = `${TOGGLE_ID_PREFIX}-${connector.id}`;
              return (
                <li key={connector.id} className={ROW_CLASS}>
                  <OfficialConnectorLogo connector={connector} className={LOGO_CLASS} />
                  <label htmlFor={switchId} className="min-w-0 flex-1 truncate text-foreground">
                    {connector.label}
                  </label>
                  <Switch
                    id={switchId}
                    checked={enabled}
                    onCheckedChange={(checked) => onSetConnectorEnabled(connector.id, checked)}
                    aria-label={`${TOGGLE_LABEL_PREFIX} ${connector.label}`}
                    className={SWITCH_CLASS}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className={DIVIDER_CLASS} />
        <button type="button" onClick={browse} className={cn(ROW_CLASS, ROW_BUTTON_CLASS)}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
            <Plug aria-hidden className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate">{COMPOSER_PLUGINS_CONNECT_LABEL}</span>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverContent>
    </Popover>
  );
}
