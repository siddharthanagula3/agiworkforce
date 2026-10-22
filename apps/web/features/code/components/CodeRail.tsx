'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Code,
  Code2,
  LibraryBig,
  MessageSquare,
  MonitorPlay,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  X,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from '@agiworkforce/ui';
import {
  CLOUD_CODE_SESSION_STATE_LABELS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
  cloudCodeSessionIsBusy,
  type CloudCodeNetworkAccess,
  type CloudCodeSession,
} from '@agiworkforce/types';
import {
  CODE_COPY,
  CODE_NETWORK_OPTIONS,
  CODE_RAIL_ITEM_IDS,
  CODE_ROUTES,
  CODE_SORT_LABELS,
  CODE_SORT_OPTIONS,
  CODE_STATUS_FILTERS,
  DEFAULT_CODE_FILTERS,
  codeRailItemPinned,
  filtersAreDefault,
  type CodeRailItemId,
  type CodeSessionFilters,
  type CodeSortOption,
  type CodeStatusFilter,
} from '../code-surface';
import { ContinueOnDesktop, useDesktopHost } from '@/features/desktop-host';
import { REMOTE_COMPUTER_PATH } from '@/features/remote-dispatch/lib/browser-pairing';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useAccountFooter } from '@shared/components/layout/AccountFooter';
import { CodeCustomizeSidebarModal, type CodeRailItem } from './CodeCustomizeSidebarModal';
import styles from '../CloudCodePage.module.css';

const RAIL_GLYPH_SIZE = 16;
const SECTION_GLYPH_SIZE = 14;
const SEGMENT_GLYPH_SIZE = 15;
const ENVIRONMENT_FILTER_ALL = 'all';

const RAIL_ITEMS: Readonly<Record<CodeRailItemId, Omit<CodeRailItem, 'id'>>> = {
  artifacts: { href: CODE_ROUTES.artifacts, label: CODE_COPY.artifacts, glyph: LibraryBig },
  routines: { href: CODE_ROUTES.routines, label: CODE_COPY.routines, glyph: CalendarClock },
  computer: { href: REMOTE_COMPUTER_PATH, label: CODE_COPY.yourComputer, glyph: MonitorPlay },
};

function useRailItems(): CodeRailItem[] {
  const host = useDesktopHost();
  return CODE_RAIL_ITEM_IDS.filter((id) => id !== 'computer' || !host).map((id) => ({
    id,
    ...RAIL_ITEMS[id],
  }));
}

function MoreMenu({
  items,
  onCustomize,
}: {
  items: readonly CodeRailItem[];
  onCustomize: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${styles['railRow']} ${open ? styles['railRowActive'] : ''}`}
        >
          <span className={styles['railRowGlyph']}>
            <Chevron size={RAIL_GLYPH_SIZE} aria-hidden="true" />
          </span>
          <span className={styles['railRowLabel']}>{CODE_COPY.more}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className={styles['moreMenu']}>
        {items.map(({ id, href, label, glyph: Glyph }) => (
          <DropdownMenuItem key={id} asChild className={styles['moreMenuItem']}>
            <Link href={href}>
              <Glyph size={RAIL_GLYPH_SIZE} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild className={styles['moreMenuItem']}>
          <Link href={CODE_ROUTES.editorExtension}>
            <Code2 size={RAIL_GLYPH_SIZE} aria-hidden="true" />
            <span>{CODE_COPY.editorExtension}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={styles['moreMenuItem']}>
          <ContinueOnDesktop
            label={CODE_COPY.desktop}
            fallbackHref={CODE_ROUTES.desktop}
            glyphSize={RAIL_GLYPH_SIZE}
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={styles['moreMenuItem']} onSelect={onCustomize}>
          <Settings size={RAIL_GLYPH_SIZE} aria-hidden="true" />
          <span>{CODE_COPY.customizeSidebar}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterMenu({
  filters,
  onChange,
}: {
  filters: CodeSessionFilters;
  onChange: (patch: Partial<CodeSessionFilters>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${styles['railIconButton']} ${
            filtersAreDefault(filters) ? '' : styles['railIconButtonActive']
          }`}
          aria-label={CODE_COPY.filterMenu}
        >
          <SlidersHorizontal size={SECTION_GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{CODE_COPY.filterStatus}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.status}
          onValueChange={(value) => onChange({ status: value as CodeStatusFilter })}
        >
          {CODE_STATUS_FILTERS.map((status) => (
            <DropdownMenuRadioItem key={status} value={status}>
              {CLOUD_CODE_SESSION_STATUS_FILTER_LABELS[status]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{CODE_COPY.filterEnvironment}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.environment}
          onValueChange={(value) =>
            onChange({
              environment:
                value === ENVIRONMENT_FILTER_ALL
                  ? ENVIRONMENT_FILTER_ALL
                  : (value as CloudCodeNetworkAccess),
            })
          }
        >
          <DropdownMenuRadioItem value={ENVIRONMENT_FILTER_ALL}>
            {CODE_COPY.filterAll}
          </DropdownMenuRadioItem>
          {CODE_NETWORK_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{CODE_COPY.filterSort}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.sort}
          onValueChange={(value) => onChange({ sort: value as CodeSortOption })}
        >
          {CODE_SORT_OPTIONS.map((sort) => (
            <DropdownMenuRadioItem key={sort} value={sort}>
              {CODE_SORT_LABELS[sort]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={filtersAreDefault(filters)}
          onSelect={() =>
            onChange({
              status: DEFAULT_CODE_FILTERS.status,
              environment: DEFAULT_CODE_FILTERS.environment,
              sort: DEFAULT_CODE_FILTERS.sort,
            })
          }
        >
          {CODE_COPY.filterClear}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionSearchField({
  query,
  onQueryChange,
  onClose,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div className="mx-1 mb-2 flex h-9 shrink-0 items-center gap-2 rounded-[var(--chat-radius-md)] border border-[var(--chat-border-strong)] bg-[var(--chat-input-bg)] pl-2 pr-1 focus-within:ring-2 focus-within:ring-focus-ring">
      <Search
        size={SECTION_GLYPH_SIZE}
        className="shrink-0 text-[var(--chat-text-secondary)]"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onClose();
        }}
        placeholder={CODE_COPY.searchSessionsPlaceholder}
        aria-label={CODE_COPY.searchSessions}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--chat-text-primary)] outline-none placeholder:text-[var(--chat-text-muted)] [&::-webkit-search-cancel-button]:appearance-none"
      />
      <button
        type="button"
        className={styles['railIconButton']}
        aria-label={CODE_COPY.closeSearch}
        onClick={onClose}
      >
        <X size={SECTION_GLYPH_SIZE} aria-hidden="true" />
      </button>
    </div>
  );
}

export interface CodeRailProps {
  sessions: CloudCodeSession[];
  /** True when the account has sessions the current status filter is hiding. */
  hiddenSessionsExist: boolean;
  selectedId: string | null;
  loading: boolean;
  filters: CodeSessionFilters;
  onFiltersChange: (patch: Partial<CodeSessionFilters>) => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string, options?: { split: boolean }) => void;
  onCollapse?: () => void;
  /** The desktop shell's own sessions. Absent in a browser. */
  localSection?: React.ReactNode;
}

export function CodeRail({
  sessions,
  hiddenSessionsExist,
  selectedId,
  loading,
  filters,
  onFiltersChange,
  onNewSession,
  onSelectSession,
  onCollapse,
  localSection,
}: CodeRailProps) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const pins = useSettingsStore((state) => state.codeRailPins);
  const railItems = useRailItems();
  const pinnedItems = railItems.filter((item) => codeRailItemPinned(item.id, pins));
  const morePinnable = railItems.filter((item) => !codeRailItemPinned(item.id, pins));
  const filterHidesSessions = filters.status === 'open' && hiddenSessionsExist;
  const accountFooter = useAccountFooter();
  const [searchOpen, setSearchOpen] = useState(filters.query.length > 0);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searching = filters.query.trim().length > 0;
  const closeSearch = () => {
    onFiltersChange({ query: '' });
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  };

  return (
    <>
      <div className={styles['railTop']} data-sidebar-region="header-first-row">
        <h2 className={styles['railTitle']}>{CODE_COPY.surface}</h2>
        <div className={styles['railTopActions']}>
          <div className={styles['segmented']}>
            <Link
              href={CODE_ROUTES.chat}
              className={styles['segment']}
              aria-label={CODE_COPY.toChat}
            >
              <MessageSquare size={SEGMENT_GLYPH_SIZE} aria-hidden="true" />
            </Link>
            <span
              className={`${styles['segment']} ${styles['segmentActive']}`}
              aria-current="page"
              aria-label={CODE_COPY.toCode}
            >
              <Code size={SEGMENT_GLYPH_SIZE} aria-hidden="true" />
            </span>
          </div>
          <button
            ref={searchButtonRef}
            type="button"
            className={`${styles['railIconButton']} ${searchOpen ? styles['railIconButtonActive'] : ''}`}
            aria-label={CODE_COPY.searchSessions}
            aria-expanded={searchOpen}
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          >
            <Search size={SECTION_GLYPH_SIZE} aria-hidden="true" />
          </button>
          {onCollapse && (
            <button
              type="button"
              className={styles['railIconButton']}
              aria-label={CODE_COPY.collapseRail}
              onClick={onCollapse}
            >
              <PanelLeft size={SECTION_GLYPH_SIZE} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <SessionSearchField
          query={filters.query}
          onQueryChange={(query) => onFiltersChange({ query })}
          onClose={closeSearch}
        />
      )}

      <button
        type="button"
        className={`${styles['railRow']} ${styles['railRowPrimary']}`}
        onClick={onNewSession}
      >
        <span className={styles['railRowGlyph']}>
          <Plus size={RAIL_GLYPH_SIZE} aria-hidden="true" />
        </span>
        <span className={styles['railRowLabel']}>{CODE_COPY.newSession}</span>
      </button>

      {pinnedItems.map(({ id, href, label, glyph: Glyph }) => (
        <Link key={id} href={href} className={styles['railRow']}>
          <span className={styles['railRowGlyph']}>
            <Glyph size={RAIL_GLYPH_SIZE} aria-hidden="true" />
          </span>
          <span className={styles['railRowLabel']}>{label}</span>
        </Link>
      ))}

      <MoreMenu items={morePinnable} onCustomize={() => setCustomizeOpen(true)} />
      <CodeCustomizeSidebarModal
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        items={railItems}
      />

      {localSection}

      <div className={styles['railSectionHeader']}>
        <span className={styles['railSectionLabel']}>{CODE_COPY.recents}</span>
        <FilterMenu filters={filters} onChange={onFiltersChange} />
      </div>

      <nav className={styles['railList']} aria-label={CODE_COPY.recents}>
        {loading && (
          <div className={styles['railEmpty']}>
            <Spinner size="sm" aria-label={CODE_COPY.loadingSessions} />
          </div>
        )}

        {!loading &&
          sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`${styles['railRow']} ${
                selectedId === session.id ? styles['railRowActive'] : ''
              }`}
              aria-current={selectedId === session.id ? 'true' : undefined}
              onClick={(event) =>
                onSelectSession(session.id, { split: event.metaKey || event.ctrlKey })
              }
            >
              <span className={styles['railRowGlyph']}>
                {cloudCodeSessionIsBusy(session) ? (
                  <span
                    className={styles['railRunningDot']}
                    aria-label={CODE_COPY.runningSession}
                  />
                ) : (
                  <Archive size={RAIL_GLYPH_SIZE} aria-hidden="true" />
                )}
              </span>
              <span className={styles['railRowLabel']}>{session.title}</span>{' '}
              {session.state === 'failed' && (
                <span className={styles['railRowState']}>
                  {CLOUD_CODE_SESSION_STATE_LABELS[session.state]}
                </span>
              )}
            </button>
          ))}

        {!loading && sessions.length === 0 && searching && (
          <div className={styles['railEmpty']}>
            <span>{CODE_COPY.noSearchMatches}</span>
          </div>
        )}

        {!loading && sessions.length === 0 && !searching && (
          <div className={styles['railEmpty']}>
            <span>{filterHidesSessions ? CODE_COPY.noOpenSessions : CODE_COPY.noSessions}</span>
            {filterHidesSessions && (
              <button
                type="button"
                className={styles['railEmptyAction']}
                onClick={() => onFiltersChange({ status: 'all' })}
              >
                {CODE_COPY.showClosed}
              </button>
            )}
          </div>
        )}
      </nav>

      {accountFooter && (
        <div
          className="shrink-0 border-t border-[var(--chat-border-subtle)] pt-1"
          data-testid="code-rail-account-footer"
        >
          {accountFooter}
        </div>
      )}
    </>
  );
}
