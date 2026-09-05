'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Spinner } from '../primitives/Spinner';
import { useConfirmAction } from '../primitives/ConfirmAction';
import { AddMarketplaceDialog } from './AddMarketplaceDialog';
import { ConnectorDetailView } from './ConnectorDetailView';
import {
  CONNECTOR_POPULAR_HEADING,
  INSTALL_CONFIRM_CANCEL_LABEL,
  INSTALL_CONFIRM_TITLE_PREFIX,
  INSTALL_LABEL,
  DIRECTORY_CATALOG_HEADINGS,
  DIRECTORY_INSTALLED_HEADINGS,
  DIRECTORY_LOADING_LABEL,
  DIRECTORY_SECTION_LABELS,
  GENERIC_ERROR_COPY,
} from './constants';
import { DirectoryGrid } from './DirectoryGrid';
import { DIRECTORY_CREATE_BUTTON } from './styles';
import { DirectoryToolbar } from './DirectoryToolbar';
import { selectDirectoryEntries, toggleFilterValue } from './filtering';
import { PluginDetailView } from './PluginDetailView';
import { SkillDetailView } from './SkillDetailView';
import type {
  DirectoryAdapter,
  DirectoryDetail,
  DirectoryEntry,
  DirectoryFilterSelection,
  DirectorySectionKey,
  DirectorySortKey,
} from './types';

const EMPTY_ENTRIES: readonly DirectoryEntry[] = [];
const DEFAULT_SORT_OPTIONS: readonly DirectorySortKey[] = ['name'];

export interface DirectoryPanelProps {
  section: DirectorySectionKey;
  adapter: DirectoryAdapter;
  openEntryId?: string | null;
  onOpenEntryChange?: (entryId: string | null) => void;
  headerActions?: ReactNode;
}

export function DirectoryPanel({
  section,
  adapter,
  openEntryId,
  onOpenEntryChange,
  headerActions,
}: DirectoryPanelProps) {
  const data = adapter[section] ?? { entries: EMPTY_ENTRIES };
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selection, setSelection] = useState<DirectoryFilterSelection>({});
  const [sort, setSort] = useState<DirectorySortKey>(data.sortOptions?.[0] ?? 'name');
  const [entryId, setEntryId] = useState<string | null>(openEntryId ?? null);
  const [detail, setDetail] = useState<DirectoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const openChangeRef = useRef(onOpenEntryChange);
  openChangeRef.current = onOpenEntryChange;

  useEffect(() => {
    setEntryId(openEntryId ?? null);
  }, [openEntryId]);

  useEffect(() => {
    openChangeRef.current?.(entryId);
  }, [entryId]);

  const showAddMarketplace = section === 'plugins' && adapter.addMarketplace !== undefined;

  const loadSection = adapter.loadSection;
  useEffect(() => {
    void loadSection?.(section);
  }, [section, loadSection]);

  const loadDetail = adapter.loadDetail;
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
  }, [section, entryId, loadDetail]);

  const visible = useMemo(
    () => selectDirectoryEntries({ entries: data.entries, query, selection, sourceId, sort }),
    [data.entries, query, selection, sourceId, sort],
  );

  const installed = useMemo(() => visible.filter((entry) => entry.installed === true), [visible]);
  const catalog = useMemo(() => visible.filter((entry) => entry.installed !== true), [visible]);
  const popular = useMemo(() => catalog.filter((entry) => entry.popular === true), [catalog]);
  const rest = useMemo(() => catalog.filter((entry) => entry.popular !== true), [catalog]);

  const runAction = useCallback(
    async (
      id: string,
      action: ((key: DirectorySectionKey, entry: string) => Promise<void> | void) | undefined,
    ) => {
      if (!action) return;
      setBusyId(id);
      try {
        await action(section, id);
      } finally {
        setBusyId(null);
      }
    },
    [section],
  );

  const requestInstall = useCallback(
    (id: string) => {
      const entry = data.entries.find((candidate) => candidate.id === id);
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
    [data.entries, adapter.install, confirm, runAction],
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

  function renderBody() {
    if (!entryId) return renderCatalog();
    if (detailLoading) {
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
      const openSettings = adapter.openSettings
        ? () => void adapter.openSettings?.(section, detail.id)
        : undefined;
      const install = adapter.install ? () => requestInstall(detail.id) : undefined;
      const remove = adapter.uninstall
        ? () => void runAction(detail.id, adapter.uninstall)
        : undefined;

      if (detail.kind === 'skill') {
        return (
          <SkillDetailView
            detail={detail}
            onBack={back}
            onInstall={install}
            onUninstall={remove}
            onCopyLink={copyLink}
            onDownloadFile={adapter.downloadSkillFile}
            busy={busy}
          />
        );
      }
      if (detail.kind === 'connector') {
        return (
          <ConnectorDetailView
            detail={detail}
            onBack={back}
            onConnect={install}
            onDisconnect={remove}
            onOpenSettings={openSettings}
            onCopyLink={copyLink}
            onOpenHref={adapter.openHref}
            footer={adapter.renderDetailFooter?.(section, detail.id)}
            busy={busy}
          />
        );
      }
      return (
        <PluginDetailView
          detail={detail}
          onBack={back}
          onInstall={install}
          onOpenSettings={openSettings}
          onCopyLink={copyLink}
          onOpenSource={(href) => void adapter.openHref?.(href)}
          busy={busy}
        />
      );
    }
    return renderCatalog();
  }

  function renderCatalog() {
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
            setSelection((prev) => toggleFilterValue(prev, groupId, value))
          }
          onClearFilters={() => setSelection({})}
          sortOptions={data.sortOptions ?? DEFAULT_SORT_OPTIONS}
          sort={sort}
          onSortChange={setSort}
          onAddMarketplace={showAddMarketplace ? () => setMarketplaceOpen(true) : undefined}
        />

        {data.notice ? (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {data.notice}
          </p>
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

        <section className="flex flex-col gap-2">
          {installed.length > 0 || popular.length > 0 ? (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {DIRECTORY_CATALOG_HEADINGS[section]}
            </h3>
          ) : null}
          <DirectoryGrid
            section={section}
            entries={rest}
            loading={data.loading}
            error={data.error ?? null}
            onRetry={data.retry}
            {...gridActions}
          />
        </section>
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
