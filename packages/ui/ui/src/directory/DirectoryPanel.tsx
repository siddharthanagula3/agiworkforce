'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import { useConfirmAction } from '../primitives/ConfirmAction';
import { isDirectoryActionNotice } from './action-notice';
import { AddMarketplaceDialog } from './AddMarketplaceDialog';
import { ConnectorDetailView } from './ConnectorDetailView';
import {
  CONNECTOR_POPULAR_HEADING,
  CUSTOM_BADGE,
  DIRECTORY_CATALOG_HEADINGS,
  DIRECTORY_CUSTOM_HEADING,
  DIRECTORY_INSTALLED_HEADINGS,
  DIRECTORY_LOADING_LABEL,
  DIRECTORY_LOADING_MORE_LABEL,
  DIRECTORY_LOAD_MORE_LABEL,
  DIRECTORY_RETRY_LABEL,
  DIRECTORY_SEARCH_DEBOUNCE_MS,
  DIRECTORY_SECTION_LABELS,
  DIRECTORY_SHOWING_OF,
  DIRECTORY_SHOWING_PREFIX,
  GENERIC_ERROR_COPY,
  INSTALL_CONFIRM_CANCEL_LABEL,
  INSTALL_CONFIRM_TITLE_PREFIX,
  INSTALL_LABEL,
} from './constants';
import { DirectoryGrid } from './DirectoryGrid';
import { DIRECTORY_CREATE_BUTTON, DIRECTORY_FOCUS_RING } from './styles';
import { DirectoryToolbar } from './DirectoryToolbar';
import { selectDirectoryEntries, toggleFilterValue } from './filtering';
import { PluginDetailView } from './PluginDetailView';
import { SkillDetailView } from './SkillDetailView';
import type {
  DirectoryAdapter,
  DirectoryDetail,
  DirectoryEntry,
  DirectoryFilterSelection,
  DirectoryGroup,
  DirectoryQuery,
  DirectorySectionKey,
  DirectorySortKey,
} from './types';

const EMPTY_ENTRIES: readonly DirectoryEntry[] = [];
const EMPTY_GROUPS: readonly DirectoryGroup[] = [];
const EMPTY_TOGGLES: Readonly<Record<string, boolean>> = {};
const DEFAULT_SORT_OPTIONS: readonly DirectorySortKey[] = ['name'];
const LOAD_MORE_ROOT_MARGIN = '240px';

export interface DirectoryPanelProps {
  section: DirectorySectionKey;
  adapter: DirectoryAdapter;
  openEntryId?: string | null;
  onOpenEntryChange?: (entryId: string | null) => void;
  headerActions?: ReactNode;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function DirectoryPanel({
  section,
  adapter,
  openEntryId,
  onOpenEntryChange,
  headerActions,
}: DirectoryPanelProps) {
  const data = adapter[section] ?? { entries: EMPTY_ENTRIES };
  const remote = data.remote === true && adapter.queryEntries !== undefined;
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, DIRECTORY_SEARCH_DEBOUNCE_MS);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selection, setSelection] = useState<DirectoryFilterSelection>({});
  const [sort, setSort] = useState<DirectorySortKey>(data.sortOptions?.[0] ?? 'name');
  const [toggleOverrides, setToggleOverrides] = useState<Readonly<Record<string, boolean>>>({});
  const [entryId, setEntryId] = useState<string | null>(openEntryId ?? null);
  const [detail, setDetail] = useState<DirectoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const openChangeRef = useRef(onOpenEntryChange);
  openChangeRef.current = onOpenEntryChange;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEntryId(openEntryId ?? null);
  }, [openEntryId]);

  useEffect(() => {
    openChangeRef.current?.(entryId);
    setActionError(null);
    setActionNotice(null);
  }, [entryId]);

  const showAddMarketplace = section === 'plugins' && adapter.addMarketplace !== undefined;

  const loadSection = adapter.loadSection;
  useEffect(() => {
    if (remote) return;
    void loadSection?.(section);
  }, [section, loadSection, remote]);

  const toggleDefaults = data.toggleDefaults ?? EMPTY_TOGGLES;
  const toggleValues = useMemo(
    () => ({ ...toggleDefaults, ...toggleOverrides }),
    [toggleDefaults, toggleOverrides],
  );

  const remoteQuery = useMemo<DirectoryQuery>(
    () => ({ search: debouncedQuery, sourceId, selection, sort, toggles: toggleValues }),
    [debouncedQuery, sourceId, selection, sort, toggleValues],
  );

  const queryEntriesRef = useRef(adapter.queryEntries);
  queryEntriesRef.current = adapter.queryEntries;
  useEffect(() => {
    if (!remote) return;
    void queryEntriesRef.current?.(section, remoteQuery);
  }, [remote, section, remoteQuery]);

  const loadMore = adapter.loadMore;
  const hasMore = data.hasMore === true;
  const loadingMore = data.loadingMore === true;
  const requestMore = useCallback(() => {
    if (!remote || !loadMore || !hasMore || loadingMore) return;
    void loadMore(section);
  }, [remote, loadMore, hasMore, loadingMore, section]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!remote || !sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) requestMore();
      },
      { rootMargin: LOAD_MORE_ROOT_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [remote, hasMore, requestMore, entryId]);

  const loadDetail = adapter.loadDetail;
  const detailSource = data.entries;
  useEffect(() => {
    if (!entryId || !loadDetail) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void Promise.resolve(loadDetail(section, entryId))
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setDetailError(caught instanceof Error ? caught.message : GENERIC_ERROR_COPY);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, entryId, loadDetail, detailSource]);

  const visible = useMemo(
    () =>
      remote
        ? [...data.entries]
        : selectDirectoryEntries({ entries: data.entries, query, selection, sourceId, sort }),
    [remote, data.entries, query, selection, sourceId, sort],
  );

  const custom = useMemo(
    () => visible.filter((entry) => entry.badges?.includes(CUSTOM_BADGE) === true),
    [visible],
  );
  const owned = useMemo(
    () => visible.filter((entry) => entry.badges?.includes(CUSTOM_BADGE) !== true),
    [visible],
  );
  const installed = useMemo(() => owned.filter((entry) => entry.installed === true), [owned]);
  const catalog = useMemo(() => owned.filter((entry) => entry.installed !== true), [owned]);
  const popular = useMemo(() => catalog.filter((entry) => entry.popular === true), [catalog]);
  const rest = useMemo(() => catalog.filter((entry) => entry.popular !== true), [catalog]);

  const runAction = useCallback(
    async (
      id: string,
      action: ((key: DirectorySectionKey, entry: string) => Promise<void> | void) | undefined,
    ) => {
      if (!action) return;
      setBusyId(id);
      setActionError(null);
      setActionNotice(null);
      try {
        await action(section, id);
      } catch (caught: unknown) {
        if (isDirectoryActionNotice(caught)) setActionNotice(caught.message);
        else setActionError(caught instanceof Error ? caught.message : GENERIC_ERROR_COPY);
      } finally {
        setBusyId(null);
      }
    },
    [section],
  );

  const requestInstall = useCallback(
    (id: string) => {
      const entry = data.entries.find((candidate) => candidate.id === id);
      if (entry?.connectableMode === 'api-key-form' && adapter.requestCredentials) {
        adapter.requestCredentials(section, id);
        setEntryId(id);
        return;
      }
      if (!entry?.installNotice) {
        void runAction(id, adapter.install);
        return;
      }
      confirm({
        title: `${INSTALL_CONFIRM_TITLE_PREFIX} ${entry.name}?`,
        description: entry.installNotice,
        confirmLabel: INSTALL_LABEL,
        cancelLabel: INSTALL_CONFIRM_CANCEL_LABEL,
        destructive: false,
        onConfirm: () => runAction(id, adapter.install),
      });
    },
    [data.entries, adapter, section, confirm, runAction],
  );

  const gridActions = {
    onOpen: setEntryId,
    ...(adapter.install && data.installable ? { onInstall: requestInstall } : {}),
    ...(adapter.openSettings && data.installable
      ? { onOpenSettings: (id: string) => void adapter.openSettings?.(section, id) }
      : {}),
    ...(adapter.uninstall && data.installable
      ? { onRemove: (id: string) => void runAction(id, adapter.uninstall) }
      : {}),
  };

  function renderActionError() {
    return (
      <>
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-danger"
          >
            {actionError}
          </p>
        ) : null}
        {actionNotice ? (
          <p
            role="status"
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
          >
            {actionNotice}
          </p>
        ) : null}
      </>
    );
  }

  function renderBody() {
    if (!entryId) return renderCatalog();
    if (detailLoading && !detail) {
      return (
        <div className="flex justify-center py-16">
          <Spinner aria-label={DIRECTORY_LOADING_LABEL} />
        </div>
      );
    }
    if (detailError) {
      return <p className="py-16 text-center text-sm text-danger">{detailError}</p>;
    }
    if (detail) {
      const busy = busyId === detail.id;
      const back = () => setEntryId(null);
      const copyLink = adapter.copyLink
        ? () => void adapter.copyLink?.(section, detail.id)
        : undefined;
      const openSettings =
        adapter.openSettings && detail.kind === 'skill' && detail.editable === true
          ? () => void adapter.openSettings?.(section, detail.id)
          : undefined;
      const install = adapter.install ? () => requestInstall(detail.id) : undefined;
      const remove = adapter.uninstall
        ? () => void runAction(detail.id, adapter.uninstall)
        : undefined;

      if (detail.kind === 'skill') {
        return (
          <>
            {renderActionError()}
            <SkillDetailView
              detail={detail}
              onBack={back}
              onInstall={install}
              onUninstall={remove}
              onOpenSettings={openSettings}
              onCopyLink={copyLink}
              onDownloadFile={adapter.downloadSkillFile}
              busy={busy}
            />
          </>
        );
      }
      if (detail.kind === 'connector') {
        const requestCredentials = adapter.requestCredentials
          ? () => adapter.requestCredentials?.(section, detail.id)
          : undefined;
        return (
          <>
            {renderActionError()}
            <ConnectorDetailView
              detail={detail}
              onBack={back}
              onConnect={install}
              onRequestCredentials={requestCredentials}
              credentialForm={adapter.renderCredentialForm?.(section, detail.id)}
              onDisconnect={remove}
              onCopyLink={copyLink}
              onCopyValue={adapter.copyValue}
              onOpenHref={adapter.openHref}
              footer={adapter.renderDetailFooter?.(section, detail.id, detail)}
              onOpenRelated={setEntryId}
              onInstallRelated={gridActions.onInstall}
              busy={busy}
            />
          </>
        );
      }
      return (
        <>
          {renderActionError()}
          <PluginDetailView
            detail={detail}
            onBack={back}
            onInstall={install}
            onUninstall={remove}
            onCopyLink={copyLink}
            onCopyValue={adapter.copyValue}
            onOpenHref={adapter.openHref}
            busy={busy}
          />
        </>
      );
    }
    return renderCatalog();
  }

  function renderRemoteFooter() {
    if (!remote || data.error) return null;
    const shown = data.entries.length;
    const total = data.total ?? shown;
    if (shown === 0) return null;
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <p className="text-xs text-muted-foreground" data-testid="directory-showing">
          {`${DIRECTORY_SHOWING_PREFIX} ${shown.toLocaleString()} ${DIRECTORY_SHOWING_OF} ${total.toLocaleString()}`}
        </p>
        {hasMore ? (
          <button
            type="button"
            onClick={requestMore}
            disabled={loadingMore}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-4 text-sm text-foreground transition-colors motion-reduce:transition-none hover:bg-muted disabled:opacity-50',
              DIRECTORY_FOCUS_RING,
            )}
          >
            {loadingMore ? <Spinner size="sm" aria-label={DIRECTORY_LOADING_MORE_LABEL} /> : null}
            {DIRECTORY_LOAD_MORE_LABEL}
          </button>
        ) : null}
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      </div>
    );
  }

  function renderCatalog() {
    const catalogHeading = data.catalogHeading ?? DIRECTORY_CATALOG_HEADINGS[section];
    const groups = data.groups ?? EMPTY_GROUPS;
    const groupIds = new Set(groups.map((group) => group.id));
    const grouped = groups
      .map((group) => ({
        ...group,
        entries: rest.filter((entry) => entry.groupId === group.id),
      }))
      .filter((group) => group.entries.length > 0);
    const ungrouped = rest.filter(
      (entry) => entry.groupId === undefined || !groupIds.has(entry.groupId),
    );
    const groupedAbove =
      installed.length > 0 || popular.length > 0 || custom.length > 0 || grouped.length > 0;
    const trailingHeading =
      groups.length > 0 ? null : groupedAbove || data.catalogHeading ? catalogHeading : null;
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            {DIRECTORY_SECTION_LABELS[section]}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {adapter.createEntry && data.createLabel ? (
              <button
                type="button"
                onClick={() => adapter.createEntry?.(section)}
                className={DIRECTORY_CREATE_BUTTON}
              >
                {data.createLabel}
              </button>
            ) : null}
            {headerActions}
          </div>
        </div>

        <DirectoryToolbar
          section={section}
          query={query}
          onQueryChange={setQuery}
          sources={data.sources ?? []}
          sourcesHeading={data.sourcesHeading}
          activeSource={sourceId}
          onSourceChange={setSourceId}
          filterGroups={data.filterGroups ?? []}
          selection={selection}
          onToggleFilter={(groupId, value) =>
            setSelection((prev) =>
              toggleFilterValue(
                prev,
                groupId,
                value,
                data.filterGroups?.some((group) => group.id === groupId && group.exclusive),
              ),
            )
          }
          onClearFilters={() => setSelection({})}
          sortOptions={data.sortOptions ?? DEFAULT_SORT_OPTIONS}
          sort={sort}
          onSortChange={setSort}
          onAddMarketplace={showAddMarketplace ? () => setMarketplaceOpen(true) : undefined}
          countLabel={data.countLabel}
          toggles={data.toggles}
          toggleValues={toggleValues}
          onToggle={(id, checked) => setToggleOverrides((prev) => ({ ...prev, [id]: checked }))}
        />

        {data.notice ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            <p>{data.notice}</p>
            {data.noticeRetry ? (
              <button
                type="button"
                onClick={() => void data.noticeRetry?.()}
                className={cn(
                  'shrink-0 font-medium text-foreground underline-offset-2 hover:underline',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                {DIRECTORY_RETRY_LABEL}
              </button>
            ) : null}
          </div>
        ) : null}

        {renderActionError()}

        <div className="flex flex-col gap-5" aria-busy={remote && data.loading === true}>
          {custom.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {DIRECTORY_CUSTOM_HEADING}
              </h3>
              <DirectoryGrid section={section} entries={custom} {...gridActions} />
            </section>
          ) : null}

          {installed.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {DIRECTORY_INSTALLED_HEADINGS[section]}
              </h3>
              <DirectoryGrid section={section} entries={installed} {...gridActions} />
            </section>
          ) : null}

          {popular.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CONNECTOR_POPULAR_HEADING}
              </h3>
              <DirectoryGrid section={section} entries={popular} {...gridActions} />
            </section>
          ) : null}

          {grouped.map((group) => (
            <section key={group.id} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.heading}
              </h3>
              <DirectoryGrid section={section} entries={group.entries} {...gridActions} />
            </section>
          ))}

          {ungrouped.length > 0 || data.loading || data.error || !groupedAbove ? (
            <section className="flex flex-col gap-2">
              {trailingHeading ? (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {trailingHeading}
                </h3>
              ) : null}
              <DirectoryGrid
                section={section}
                entries={ungrouped}
                loading={data.loading}
                error={data.error ?? null}
                onRetry={data.retry}
                {...gridActions}
              />
            </section>
          ) : null}

          {renderRemoteFooter()}
        </div>
      </div>
    );
  }

  return (
    <>
      {confirmDialog}
      {renderBody()}
      {adapter.addMarketplace ? (
        <AddMarketplaceDialog
          open={marketplaceOpen}
          onClose={() => {
            setMarketplaceOpen(false);
            void adapter.loadSection?.('plugins');
          }}
          onSubmit={adapter.addMarketplace}
          {...(adapter.removeMarketplace ? { onRemove: adapter.removeMarketplace } : {})}
        />
      ) : null}
    </>
  );
}
