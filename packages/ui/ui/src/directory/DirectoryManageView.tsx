'use client';

import { ChevronDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import { Menu, MenuItem } from '../sidebar/Menu';
import {
  DIRECTORY_ADD_MENU_LABEL,
  DIRECTORY_BROWSE_LABEL,
  DIRECTORY_LOADING_LABEL,
  DIRECTORY_MANAGE_COLUMNS,
  DIRECTORY_MANAGE_COLUMN_HEADINGS,
  DIRECTORY_MANAGE_EMPTY_ACTION_LABELS,
  DIRECTORY_MANAGE_EMPTY_BODIES,
  DIRECTORY_MANAGE_EMPTY_TITLES,
  DIRECTORY_MANAGE_META_SEPARATOR,
  DIRECTORY_MANAGE_NAME_HEADINGS,
  DIRECTORY_MANAGE_NO_MATCH_COPY,
  DIRECTORY_MANAGE_ROW_ACTION_PREFIX,
  DIRECTORY_MANAGE_SINGULAR_COUNT,
  DIRECTORY_MANAGE_SKILL_COUNT_LABELS,
  DIRECTORY_MANAGE_SLASH_PREFIX,
  DIRECTORY_MANAGE_UNKNOWN_VALUE,
  DIRECTORY_RETRY_LABEL,
  DIRECTORY_SEARCH_PLACEHOLDERS,
  DIRECTORY_SECTION_LABELS,
} from './constants';
import { DIRECTORY_CREATE_BUTTON, DIRECTORY_FOCUS_RING, DIRECTORY_MENU_TRIGGER } from './styles';
import type {
  DirectoryManageColumn,
  DirectoryManageRow,
  DirectoryManageSection,
  DirectorySectionKey,
} from './types';

const CELL_CLASS = 'hidden px-3 py-2.5 text-sm text-muted-foreground sm:table-cell';
const HEAD_CELL_CLASS =
  'px-3 pb-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground';
const TRAILING_HEAD_CELL_CLASS = `hidden sm:table-cell ${HEAD_CELL_CLASS}`;

function formatUpdated(value: string | undefined): string {
  if (!value) return DIRECTORY_MANAGE_UNKNOWN_VALUE;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? DIRECTORY_MANAGE_UNKNOWN_VALUE
    : parsed.toLocaleDateString();
}

function matchesRow(row: DirectoryManageRow, needle: string): boolean {
  if (needle.length === 0) return true;
  return (
    row.name.toLowerCase().includes(needle) || (row.author ?? '').toLowerCase().includes(needle)
  );
}

function cellValue(row: DirectoryManageRow, column: DirectoryManageColumn): ReactNode {
  if (column === 'author') return row.author ?? DIRECTORY_MANAGE_UNKNOWN_VALUE;
  if (column === 'skills') {
    return row.skillCount === undefined
      ? DIRECTORY_MANAGE_UNKNOWN_VALUE
      : row.skillCount.toLocaleString();
  }
  return formatUpdated(row.updatedAt);
}

function metaValue(row: DirectoryManageRow, column: DirectoryManageColumn): string {
  if (column === 'author') return row.author ?? '';
  if (column === 'skills') {
    if (row.skillCount === undefined) return '';
    const label =
      row.skillCount === DIRECTORY_MANAGE_SINGULAR_COUNT
        ? DIRECTORY_MANAGE_SKILL_COUNT_LABELS.one
        : DIRECTORY_MANAGE_SKILL_COUNT_LABELS.other;
    return `${row.skillCount.toLocaleString()} ${label}`;
  }
  return formatUpdated(row.updatedAt);
}

function metaLine(
  row: DirectoryManageRow,
  columns: readonly Exclude<DirectoryManageColumn, 'name'>[],
): string {
  return columns
    .map((column) => metaValue(row, column))
    .filter((value) => value.length > 0)
    .join(` ${DIRECTORY_MANAGE_META_SEPARATOR} `);
}

export function DirectoryManageView({
  section,
  view,
  onBrowse,
  onOpen,
  headerActions,
}: {
  section: DirectorySectionKey;
  view: DirectoryManageSection;
  onBrowse: () => void;
  onOpen: (id: string) => void;
  headerActions?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const columns = DIRECTORY_MANAGE_COLUMNS[section];
  const trailing = columns.filter(
    (column): column is Exclude<DirectoryManageColumn, 'name'> => column !== 'name',
  );
  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () => view.rows.filter((row) => matchesRow(row, needle)),
    [view.rows, needle],
  );
  const actions = view.actions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {DIRECTORY_SECTION_LABELS[section]}
        </h2>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onBrowse} className={DIRECTORY_CREATE_BUTTON}>
            {DIRECTORY_BROWSE_LABEL}
          </button>
          {actions.length > 0 ? (
            <Menu
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  className={cn(DIRECTORY_MENU_TRIGGER, 'min-h-8', DIRECTORY_FOCUS_RING)}
                >
                  <Plus aria-hidden className="size-3.5" />
                  {DIRECTORY_ADD_MENU_LABEL}
                  <ChevronDown aria-hidden className="size-3.5" />
                </button>
              )}
            >
              {({ close }) =>
                actions.map((action) => (
                  <MenuItem key={action.id} onSelect={action.onSelect} close={close}>
                    {action.label}
                  </MenuItem>
                ))
              }
            </Menu>
          ) : null}
          {headerActions}
        </div>
      </div>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={DIRECTORY_SEARCH_PLACEHOLDERS[section]}
          aria-label={DIRECTORY_SEARCH_PLACEHOLDERS[section]}
          className={cn(
            'h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground',
            DIRECTORY_FOCUS_RING,
          )}
        />
      </div>

      {view.error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-danger">
          <p role="alert">{view.error}</p>
          {view.retry ? (
            <button
              type="button"
              onClick={() => void view.retry?.()}
              className={cn(
                'shrink-0 text-sm font-medium text-foreground underline-offset-2 hover:underline',
                DIRECTORY_FOCUS_RING,
              )}
            >
              {DIRECTORY_RETRY_LABEL}
            </button>
          ) : null}
        </div>
      ) : null}

      {view.loading && view.rows.length === 0 ? (
        <div className="flex justify-center py-12">
          <Spinner aria-label={DIRECTORY_LOADING_LABEL} />
        </div>
      ) : view.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {DIRECTORY_MANAGE_EMPTY_TITLES[section]}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {DIRECTORY_MANAGE_EMPTY_BODIES[section]}
          </p>
          <button
            type="button"
            onClick={onBrowse}
            className={cn(DIRECTORY_CREATE_BUTTON, 'mt-2 min-h-9')}
          >
            {DIRECTORY_MANAGE_EMPTY_ACTION_LABELS[section]}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {DIRECTORY_MANAGE_NO_MATCH_COPY}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={HEAD_CELL_CLASS}>
                  {DIRECTORY_MANAGE_NAME_HEADINGS[section]}
                </th>
                {trailing.map((column) => (
                  <th key={column} scope="col" className={TRAILING_HEAD_CELL_CLASS}>
                    {DIRECTORY_MANAGE_COLUMN_HEADINGS[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-t border-border">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer transition-colors motion-reduce:transition-none hover:bg-muted"
                  onClick={() => onOpen(row.id)}
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(row.id);
                      }}
                      aria-label={`${DIRECTORY_MANAGE_ROW_ACTION_PREFIX} ${row.name}`}
                      className={cn(
                        'max-w-full truncate rounded-sm text-left text-sm font-medium text-foreground',
                        row.slashName ? 'font-mono' : '',
                        DIRECTORY_FOCUS_RING,
                      )}
                    >
                      {row.slashName ? `${DIRECTORY_MANAGE_SLASH_PREFIX}${row.name}` : row.name}
                    </button>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                      {metaLine(row, trailing)}
                    </p>
                  </td>
                  {trailing.map((column) => (
                    <td key={column} className={CELL_CLASS}>
                      <span className="block max-w-[16rem] truncate">{cellValue(row, column)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
