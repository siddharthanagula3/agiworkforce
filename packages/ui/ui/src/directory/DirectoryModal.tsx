'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../primitives/Dialog';
import { Spinner } from '../primitives/Spinner';
import { AddMarketplaceDialog } from './AddMarketplaceDialog';
import { ConnectorDetailView } from './ConnectorDetailView';
import {
  DEFAULT_DIRECTORY_SECTION,
  DIRECTORY_CLOSE_LABEL,
  DIRECTORY_LOADING_LABEL,
  DIRECTORY_SECTION_LABELS,
  DIRECTORY_TITLE,
  GENERIC_ERROR_COPY,
} from './constants';
import { DirectoryGrid } from './DirectoryGrid';
import { DirectoryRail } from './DirectoryRail';
import { DirectoryToolbar } from './DirectoryToolbar';
import { selectDirectoryEntries, toggleFilterValue } from './filtering';
import { PluginDetailView } from './PluginDetailView';
import { SkillDetailView } from './SkillDetailView';
import type {
  DirectoryAdapter,
  DirectoryDetail,
  DirectoryFilterSelection,
  DirectorySection,
  DirectorySectionKey,
  DirectorySortKey,
} from './types';

interface SectionState {
  query: string;
  sourceId: string | null;
  selection: DirectoryFilterSelection;
  sort: DirectorySortKey;
}

const EMPTY_SECTION: DirectorySection = { entries: [] };
const DEFAULT_SORT_OPTIONS: readonly DirectorySortKey[] = ['name'];

function initialState(section: DirectorySection | undefined): SectionState {
  return {
    query: '',
    sourceId: null,
    selection: {},
    sort: section?.sortOptions?.[0] ?? 'name',
  };
}

export interface DirectoryModalProps {
  open: boolean;
  onClose: () => void;
  adapter: DirectoryAdapter;
  initialSection?: DirectorySectionKey;
  initialEntryId?: string | null;
  onRouteChange?: (section: DirectorySectionKey, entryId: string | null) => void;
}

export function DirectoryModal({
  open,
  onClose,
  adapter,
  initialSection,
  initialEntryId,
  onRouteChange,
}: DirectoryModalProps) {
  const sections = adapter.sections;
  const [section, setSection] = useState<DirectorySectionKey>(
    initialSection && sections.includes(initialSection)
      ? initialSection
      : (sections[0] ?? DEFAULT_DIRECTORY_SECTION),
  );
  const [states, setStates] = useState<Partial<Record<DirectorySectionKey, SectionState>>>({});
  const [entryId, setEntryId] = useState<string | null>(initialEntryId ?? null);
  const [detail, setDetail] = useState<DirectoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const routeRef = useRef(onRouteChange);
  routeRef.current = onRouteChange;

  const data = adapter[section] ?? EMPTY_SECTION;
  const state = states[section] ?? initialState(adapter[section]);

  const patchState = useCallback(
    (patch: Partial<SectionState>) => {
      setStates((prev) => ({
        ...prev,
        [section]: { ...(prev[section] ?? initialState(adapter[section])), ...patch },
      }));
    },
    [section, adapter],
  );

  useEffect(() => {
    if (!initialSection || !sections.includes(initialSection)) return;
    setSection(initialSection);
  }, [initialSection, sections]);

  useEffect(() => {
    setEntryId(initialEntryId ?? null);
  }, [initialEntryId]);

  const loadSection = adapter.loadSection;
  useEffect(() => {
    if (!open) return;
    void loadSection?.(section);
  }, [open, section, loadSection]);

  useEffect(() => {
    routeRef.current?.(section, entryId);
  }, [section, entryId]);

  const loadDetail = adapter.loadDetail;
  useEffect(() => {
    if (!open || !entryId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    if (!loadDetail) return;
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
  }, [open, section, entryId, loadDetail]);

  const visible = useMemo(
    () =>
      selectDirectoryEntries({
        entries: data.entries,
        query: state.query,
        selection: state.selection,
        sourceId: state.sourceId,
        sort: state.sort,
      }),
    [data.entries, state.query, state.selection, state.sourceId, state.sort],
  );

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

  const selectSection = (next: DirectorySectionKey) => {
    setEntryId(null);
    setSection(next);
  };

  const closeDetail = () => setEntryId(null);

  const marketplaceEnabled = section === 'plugins' && adapter.addMarketplace !== undefined;

  function renderDetail() {
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
    if (!detail) return null;
    const busy = busyId === detail.id;
    const copyLink = adapter.copyLink
      ? () => void adapter.copyLink?.(section, detail.id)
      : undefined;
    const openSettings = adapter.openSettings
      ? () => void adapter.openSettings?.(section, detail.id)
      : undefined;
    const install =
      adapter.install && data.installable
        ? () => void runAction(detail.id, adapter.install)
        : undefined;
    const remove =
      adapter.uninstall && data.installable
        ? () => void runAction(detail.id, adapter.uninstall)
        : undefined;

    if (detail.kind === 'skill') {
      return (
        <SkillDetailView
          detail={detail}
          onBack={closeDetail}
          onInstall={install}
          onOpenSettings={openSettings}
          onRemove={remove}
          onCopyLink={copyLink}
          busy={busy}
        />
      );
    }
    if (detail.kind === 'connector') {
      return (
        <ConnectorDetailView
          detail={detail}
          onBack={closeDetail}
          onConnect={install}
          onOpenSettings={openSettings}
          onCopyLink={copyLink}
          busy={busy}
        />
      );
    }
    return (
      <PluginDetailView
        detail={detail}
        onBack={closeDetail}
        onInstall={install}
        onOpenSettings={openSettings}
        onCopyLink={copyLink}
        onOpenSource={(href) => void adapter.openHref?.(href)}
        busy={busy}
      />
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          closeLabel={DIRECTORY_CLOSE_LABEL}
          aria-describedby={undefined}
          className="flex h-[min(94vh,720px)] w-[min(96vw,1040px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-border bg-background p-0"
        >
          <div className="flex items-center justify-between px-6 pt-5">
            <DialogTitle className="font-serif text-2xl font-semibold text-foreground">
              {DIRECTORY_TITLE}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {DIRECTORY_SECTION_LABELS[section]}
          </DialogDescription>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <DirectoryRail sections={sections} active={section} onSelect={selectSection} />

            <div
              role="tabpanel"
              id={`directory-panel-${section}`}
              aria-labelledby={`directory-tab-${section}`}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
            >
              {entryId ? (
                renderDetail()
              ) : (
                <>
                  <DirectoryToolbar
                    section={section}
                    query={state.query}
                    onQueryChange={(query) => patchState({ query })}
                    sources={data.sources ?? []}
                    sourcesHeading={data.sourcesHeading}
                    activeSource={state.sourceId}
                    onSourceChange={(sourceId) => patchState({ sourceId })}
                    filterGroups={data.filterGroups ?? []}
                    selection={state.selection}
                    onToggleFilter={(groupId, value) =>
                      patchState({ selection: toggleFilterValue(state.selection, groupId, value) })
                    }
                    onClearFilters={() => patchState({ selection: {} })}
                    sortOptions={data.sortOptions ?? DEFAULT_SORT_OPTIONS}
                    sort={state.sort}
                    onSortChange={(sort) => patchState({ sort })}
                    {...(marketplaceEnabled
                      ? { onAddMarketplace: () => setMarketplaceOpen(true) }
                      : {})}
                  />
                  <DirectoryGrid
                    section={section}
                    entries={visible}
                    loading={data.loading}
                    error={data.error ?? null}
                    onRetry={data.retry}
                    onOpen={setEntryId}
                    {...(adapter.install && data.installable
                      ? { onInstall: (id: string) => void runAction(id, adapter.install) }
                      : {})}
                    {...(adapter.openSettings && data.installable
                      ? {
                          onOpenSettings: (id: string) => void adapter.openSettings?.(section, id),
                        }
                      : {})}
                    {...(adapter.uninstall && data.installable
                      ? { onRemove: (id: string) => void runAction(id, adapter.uninstall) }
                      : {})}
                  />
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {adapter.addMarketplace ? (
        <AddMarketplaceDialog
          open={marketplaceOpen}
          onClose={() => {
            setMarketplaceOpen(false);
            void adapter.loadSection?.('plugins');
          }}
          onSubmit={adapter.addMarketplace}
          {...(adapter.browseMarketplaceSources
            ? { onBrowseSources: adapter.browseMarketplaceSources }
            : {})}
          {...(adapter.removeMarketplace ? { onRemove: adapter.removeMarketplace } : {})}
        />
      ) : null}
    </>
  );
}
