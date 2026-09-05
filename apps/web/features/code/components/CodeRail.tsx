'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import {
  Archive,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Code,
  Code2,
  Download,
  LibraryBig,
  MessageSquare,
  PanelLeft,
  Plus,
  Settings,
  type Icon,
} from '@agiworkforce/icons';
import { SlidersHorizontal } from 'lucide-react';
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
import type { CloudCodeNetworkAccess, CloudCodeSession } from '@agiworkforce/types';
import {
  CODE_COPY,
  CODE_NETWORK_OPTIONS,
  CODE_ROUTES,
  CODE_SORT_LABELS,
  CODE_SORT_OPTIONS,
  CODE_STATUS_FILTERS,
  CODE_STATUS_FILTER_LABELS,
  DEFAULT_CODE_FILTERS,
  filtersAreDefault,
  sessionIsBusy,
  sessionStateLabel,
  type CodeSessionFilters,
  type CodeSortOption,
  type CodeStatusFilter,
} from '../code-surface';
import styles from '../CloudCodePage.module.css';

const RAIL_GLYPH_SIZE = 16;
const SECTION_GLYPH_SIZE = 14;
const SEGMENT_GLYPH_SIZE = 15;
const ENVIRONMENT_FILTER_ALL = 'all';

interface RailLink {
  href: string;
  label: string;
  glyph: Icon;
}

const PRIMARY_LINKS: readonly RailLink[] = [
  { href: CODE_ROUTES.artifacts, label: CODE_COPY.artifacts, glyph: LibraryBig },
  { href: CODE_ROUTES.customize, label: CODE_COPY.customize, glyph: Settings },
];

const MORE_LINKS: readonly RailLink[] = [
  { href: CODE_ROUTES.routines, label: CODE_COPY.routines, glyph: CalendarClock },
  { href: CODE_ROUTES.editorExtension, label: CODE_COPY.editorExtension, glyph: Code2 },
  { href: CODE_ROUTES.desktop, label: CODE_COPY.desktop, glyph: Download },
];

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
              {CODE_STATUS_FILTER_LABELS[status]}
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
          onSelect={() => onChange(DEFAULT_CODE_FILTERS)}
        >
          {CODE_COPY.filterClear}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface CodeRailProps {
  sessions: CloudCodeSession[];
  /** Before the filters, so an empty account reads differently from an empty filter. */
  totalSessions: number;
  selectedId: string | null;
  loading: boolean;
  filters: CodeSessionFilters;
  onFiltersChange: (patch: Partial<CodeSessionFilters>) => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onCollapse?: () => void;
}

export function CodeRail({
  sessions,
  totalSessions,
  selectedId,
  loading,
  filters,
  onFiltersChange,
  onNewSession,
  onSelectSession,
  onCollapse,
}: CodeRailProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRegionId = useId();
  const filterHidesSessions = totalSessions > 0 && filters.status === 'open';

  return (
    <>
      <div className={styles['railTop']}>
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

      {PRIMARY_LINKS.map(({ href, label, glyph: Glyph }) => (
        <Link key={href} href={href} className={styles['railRow']}>
          <span className={styles['railRowGlyph']}>
            <Glyph size={RAIL_GLYPH_SIZE} aria-hidden="true" />
          </span>
          <span className={styles['railRowLabel']}>{label}</span>
        </Link>
      ))}

      <button
        type="button"
        className={styles['railRow']}
        aria-expanded={moreOpen}
        aria-controls={moreRegionId}
        onClick={() => setMoreOpen((open) => !open)}
      >
        <span className={styles['railRowGlyph']}>
          {moreOpen ? (
            <ChevronDown size={RAIL_GLYPH_SIZE} aria-hidden="true" />
          ) : (
            <ChevronRight size={RAIL_GLYPH_SIZE} aria-hidden="true" />
          )}
        </span>
        <span className={styles['railRowLabel']}>{CODE_COPY.more}</span>
      </button>

      {moreOpen && (
        <div id={moreRegionId}>
          {MORE_LINKS.map(({ href, label, glyph: Glyph }) => (
            <Link key={href} href={href} className={`${styles['railRow']} ${styles['railSubRow']}`}>
              <span className={styles['railRowGlyph']}>
                <Glyph size={SECTION_GLYPH_SIZE} aria-hidden="true" />
              </span>
              <span className={styles['railRowLabel']}>{label}</span>
            </Link>
          ))}
        </div>
      )}

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
              onClick={() => onSelectSession(session.id)}
            >
              <span className={styles['railRowGlyph']}>
                {sessionIsBusy(session) ? (
                  <span
                    className={styles['railRunningDot']}
                    aria-label={CODE_COPY.runningSession}
                  />
                ) : (
                  <Archive size={RAIL_GLYPH_SIZE} aria-hidden="true" />
                )}
              </span>
              <span className={styles['railRowLabel']}>{session.title}</span>
              {session.state === 'failed' && (
                <span className={styles['railRowState']}>{sessionStateLabel(session)}</span>
              )}
            </button>
          ))}

        {!loading && sessions.length === 0 && (
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
    </>
  );
}
