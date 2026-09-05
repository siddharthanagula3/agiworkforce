'use client';

import { Check, ChevronDown, Plus, Search } from 'lucide-react';

import { cn } from '../cn';
import { Menu, MenuItem, MenuSeparator } from '../sidebar/Menu';
import {
  ADD_MARKETPLACE_LABEL,
  CLEAR_FILTERS_LABEL,
  DIRECTORY_SEARCH_PLACEHOLDERS,
  DIRECTORY_SORT_LABELS,
  DIRECTORY_SOURCE_ALL_ID,
  FILTER_MENU_LABEL,
  SORT_MENU_LABEL,
} from './constants';
import { countActiveFilters } from './filtering';
import { DIRECTORY_CHIP, DIRECTORY_FOCUS_RING, DIRECTORY_MENU_TRIGGER } from './styles';
import type {
  DirectoryFilterGroup,
  DirectoryFilterSelection,
  DirectorySectionKey,
  DirectorySortKey,
  DirectorySourceChip,
} from './types';

export function DirectoryToolbar({
  section,
  query,
  onQueryChange,
  sources,
  sourcesHeading,
  activeSource,
  onSourceChange,
  filterGroups,
  selection,
  onToggleFilter,
  onClearFilters,
  sortOptions,
  sort,
  onSortChange,
  onAddMarketplace,
}: {
  section: DirectorySectionKey;
  query: string;
  onQueryChange: (value: string) => void;
  sources: readonly DirectorySourceChip[];
  sourcesHeading?: string;
  activeSource: string | null;
  onSourceChange: (sourceId: string | null) => void;
  filterGroups: readonly DirectoryFilterGroup[];
  selection: DirectoryFilterSelection;
  onToggleFilter: (groupId: string, value: string) => void;
  onClearFilters: () => void;
  sortOptions: readonly DirectorySortKey[];
  sort: DirectorySortKey;
  onSortChange: (sort: DirectorySortKey) => void;
  onAddMarketplace?: () => void;
}) {
  const activeFilterCount = countActiveFilters(selection);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={DIRECTORY_SEARCH_PLACEHOLDERS[section]}
          aria-label={DIRECTORY_SEARCH_PLACEHOLDERS[section]}
          className={cn(
            'h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground',
            DIRECTORY_FOCUS_RING,
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sourcesHeading ? (
          <span className="text-sm font-medium text-foreground">{sourcesHeading}</span>
        ) : null}
        {sources.map((source) => {
          const isAll = source.id === DIRECTORY_SOURCE_ALL_ID;
          const selected = isAll ? activeSource === null : activeSource === source.id;
          return (
            <button
              key={source.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSourceChange(isAll ? null : selected ? null : source.id)}
              className={cn(
                DIRECTORY_CHIP,
                selected
                  ? 'bg-muted font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                DIRECTORY_FOCUS_RING,
              )}
            >
              {source.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {filterGroups.length > 0 ? (
            <Menu
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  className={cn(DIRECTORY_MENU_TRIGGER, DIRECTORY_FOCUS_RING)}
                >
                  {FILTER_MENU_LABEL}
                  {activeFilterCount > 0 ? (
                    <span className="font-mono text-xs">{activeFilterCount}</span>
                  ) : null}
                  <ChevronDown aria-hidden className="size-3.5" />
                </button>
              )}
            >
              {({ close }) => (
                <>
                  {filterGroups.map((group, index) => (
                    <div key={group.id}>
                      {index > 0 ? <MenuSeparator /> : null}
                      <p className="px-3 py-1.5 text-xs text-muted-foreground">{group.label}</p>
                      {group.options.map((option) => {
                        const checked = (selection[group.id] ?? []).includes(option.value);
                        return (
                          <MenuItem
                            key={option.value}
                            close={close}
                            onSelect={() => onToggleFilter(group.id, option.value)}
                            trailing={
                              checked ? <Check aria-hidden className="size-4" /> : undefined
                            }
                          >
                            {option.label}
                          </MenuItem>
                        );
                      })}
                    </div>
                  ))}
                  {activeFilterCount > 0 ? (
                    <>
                      <MenuSeparator />
                      <MenuItem close={close} onSelect={onClearFilters}>
                        {CLEAR_FILTERS_LABEL}
                      </MenuItem>
                    </>
                  ) : null}
                </>
              )}
            </Menu>
          ) : null}

          {sortOptions.length > 1 ? (
            <Menu
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  className={cn(DIRECTORY_MENU_TRIGGER, DIRECTORY_FOCUS_RING)}
                >
                  {SORT_MENU_LABEL}
                  <ChevronDown aria-hidden className="size-3.5" />
                </button>
              )}
            >
              {({ close }) => (
                <>
                  {sortOptions.map((option) => (
                    <MenuItem
                      key={option}
                      close={close}
                      onSelect={() => onSortChange(option)}
                      trailing={
                        option === sort ? <Check aria-hidden className="size-4" /> : undefined
                      }
                    >
                      {DIRECTORY_SORT_LABELS[option]}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          ) : null}

          {onAddMarketplace ? (
            <button
              type="button"
              onClick={onAddMarketplace}
              aria-label={ADD_MARKETPLACE_LABEL}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-md border border-border text-foreground transition-colors motion-reduce:transition-none hover:bg-muted',
                DIRECTORY_FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
