'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { toUserMessage } from '../lib/network-error';
import { Spinner } from '../primitives/Spinner';
import { Switch } from '../primitives/Switch';
import {
  CONNECT_LABEL,
  DIRECTORY_LOADING_LABEL,
  GENERIC_ERROR_COPY,
  INSTALLED_LABEL,
  INSTALL_LABEL,
  PLUGIN_CONNECTOR_CONNECTED_LABEL,
  PLUGIN_CONNECTOR_MISSING_LABEL,
  SKILL_ACCESS_HEADING,
  SKILL_ACCESS_LABEL,
  SKILL_ACCESS_VALUE,
  SKILL_ADDED_LABEL,
  SKILL_DESCRIPTION_LABEL,
  SKILL_ENABLED_HINT,
  SKILL_ENABLED_LABEL,
  SKILL_LICENSE_LABEL,
  SKILL_REQUIRED_CONNECTORS_LABEL,
  SKILL_REQUIRED_TOOLS_LABEL,
  SKILL_SOURCE_LABEL,
  SKILL_TRY_IN_CHAT_LABEL,
  SKILL_VERSION_LABEL,
  UNINSTALL_LABEL,
} from './constants';
import { DirectoryBackLink, DirectoryDetailHeader } from './DirectoryDetailHeader';
import { isTextFile } from './highlight';
import { SkillFileBody, SkillFileTree } from './SkillFileViewer';
import {
  DETAIL_HEADING,
  DETAIL_LABEL,
  DIRECTORY_CREATE_BUTTON,
  DIRECTORY_FOCUS_RING,
} from './styles';
import type { DirectoryPluginConnectorSetting, DirectorySkillDetail } from './types';

const SKILL_DELETE_LABEL = 'Delete skill';
const SKILL_DELETE_HINT = 'Deleting removes this skill for good. It cannot be recovered.';
const EMPTY_TOOLS: readonly string[] = [];
const EMPTY_CONNECTORS: readonly DirectoryPluginConnectorSetting[] = [];

function formatAddedAt(value: string | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString();
}

function AccessRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className={DETAIL_LABEL}>{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function SkillAccessSummary({
  detail,
  onOpenConnector,
}: {
  detail: DirectorySkillDetail;
  onOpenConnector?: (connectorId: string) => void;
}) {
  const tools = detail.requiredTools ?? EMPTY_TOOLS;
  const connectors = detail.requiredConnectors ?? EMPTY_CONNECTORS;
  const added = formatAddedAt(detail.addedAt);
  return (
    <section className="flex flex-col gap-3" data-testid="skill-access-summary">
      <h4 className={DETAIL_HEADING}>{SKILL_ACCESS_HEADING}</h4>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {detail.provenance ? (
          <AccessRow label={SKILL_SOURCE_LABEL}>{detail.provenance}</AccessRow>
        ) : null}
        {added ? <AccessRow label={SKILL_ADDED_LABEL}>{added}</AccessRow> : null}
        {detail.version ? (
          <AccessRow label={SKILL_VERSION_LABEL}>{detail.version}</AccessRow>
        ) : null}
        {tools.length > 0 ? (
          <AccessRow label={SKILL_REQUIRED_TOOLS_LABEL}>
            <ul className="flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <li
                  key={tool}
                  className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground"
                  title={tool}
                >
                  {tool}
                </li>
              ))}
            </ul>
          </AccessRow>
        ) : null}
        {connectors.length > 0 ? (
          <AccessRow label={SKILL_REQUIRED_CONNECTORS_LABEL}>
            <ul className="flex flex-col gap-2">
              {connectors.map((connector) => (
                <li key={connector.id} className="flex min-w-0 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{connector.name}</span>
                  {connector.connected ? (
                    <span className="shrink-0 text-xs text-success-text">
                      {PLUGIN_CONNECTOR_CONNECTED_LABEL}
                    </span>
                  ) : onOpenConnector ? (
                    <button
                      type="button"
                      onClick={() => onOpenConnector(connector.id)}
                      className={cn(DIRECTORY_CREATE_BUTTON, 'min-h-9 shrink-0')}
                    >
                      {CONNECT_LABEL}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {PLUGIN_CONNECTOR_MISSING_LABEL}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </AccessRow>
        ) : null}
        <AccessRow label={SKILL_ACCESS_LABEL}>{SKILL_ACCESS_VALUE}</AccessRow>
      </dl>
    </section>
  );
}

export function SkillDetailView({
  detail,
  onBack,
  onInstall,
  onUninstall,
  onDelete,
  onOpenSettings,
  onCopyLink,
  onCopyContent,
  onDownloadFile,
  onSetEnabled,
  onTryInChat,
  onOpenConnector,
  busy,
}: {
  detail: DirectorySkillDetail;
  onBack: () => void;
  onInstall?: () => void;
  onUninstall?: () => void;
  onDelete?: () => void;
  onOpenSettings?: () => void;
  onCopyLink?: () => void;
  onCopyContent?: (content: string) => void;
  onDownloadFile?: (skillId: string, path: string) => Promise<void> | void;
  onSetEnabled?: (enabled: boolean) => Promise<void> | void;
  onTryInChat?: () => void;
  onOpenConnector?: (connectorId: string) => void;
  busy?: boolean;
}) {
  const entryPath = detail.files[0]?.path ?? '';
  const [selectedPath, setSelectedPath] = useState(entryPath);
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const selected = useMemo(
    () => detail.files.find((file) => file.path === selectedPath) ?? detail.files[0],
    [detail.files, selectedPath],
  );
  const path = selected?.path;
  const inline = selected?.content;
  const previewable = selected ? (selected.previewable ?? isTextFile(selected.path)) : false;
  const content = inline ?? (path ? loaded[path] : undefined);
  const readFile = detail.readFile;
  const isEntryFile = path === entryPath;

  useEffect(() => {
    if (!path || !previewable || inline !== undefined) return;
    if (!readFile || loaded[path] !== undefined) return;
    let cancelled = false;
    setFileLoading(true);
    setFileError(null);
    void readFile(path)
      .then((text) => {
        if (!cancelled) setLoaded((prev) => ({ ...prev, [path]: text }));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFileError(toUserMessage(caught, GENERIC_ERROR_COPY));
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, previewable, inline, readFile, loaded]);

  const installed = detail.installed === true;
  const editable = detail.editable === true && onOpenSettings !== undefined;
  const switchable = installed && !editable && onSetEnabled !== undefined;
  const switchId = `skill-enabled-${detail.id}`;

  return (
    <div className="flex flex-col gap-4">
      <DirectoryBackLink onBack={onBack} />
      <DirectoryDetailHeader
        title={detail.name}
        name={detail.name}
        subtitle={detail.publisher}
        primaryLabel={
          editable || switchable ? INSTALLED_LABEL : installed ? UNINSTALL_LABEL : INSTALL_LABEL
        }
        primaryDone={editable || switchable}
        primarySecondary={installed}
        onPrimary={editable || switchable ? undefined : installed ? onUninstall : onInstall}
        onOpenSettings={editable ? onOpenSettings : undefined}
        onCopyLink={onCopyLink}
        busy={busy}
      />

      {switchable ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <label htmlFor={switchId} className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{SKILL_ENABLED_LABEL}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{SKILL_ENABLED_HINT}</span>
          </label>
          <Switch
            id={switchId}
            checked
            disabled={busy}
            onCheckedChange={(checked) => void onSetEnabled?.(checked)}
            aria-label={SKILL_ENABLED_LABEL}
          />
        </div>
      ) : null}

      {onTryInChat && installed ? (
        <div>
          <button
            type="button"
            onClick={onTryInChat}
            className={cn(DIRECTORY_CREATE_BUTTON, 'min-h-9')}
          >
            {SKILL_TRY_IN_CHAT_LABEL}
          </button>
        </div>
      ) : null}

      <SkillAccessSummary detail={detail} onOpenConnector={onOpenConnector} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <SkillFileTree
          files={detail.files}
          selectedPath={selected?.path}
          onSelect={setSelectedPath}
        />

        <section className="rounded-xl border border-border bg-card p-4">
          {isEntryFile ? (
            <dl className="mb-3 text-sm">
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{SKILL_DESCRIPTION_LABEL}</dt>
                <dd className="text-foreground">{detail.description}</dd>
              </div>
              {detail.license ? (
                <div className="mt-3 flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{SKILL_LICENSE_LABEL}</dt>
                  <dd className="text-foreground">{detail.license}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mb-3 truncate font-mono text-xs text-muted-foreground">{path}</p>
          )}

          {fileLoading ? (
            <div className="flex justify-center py-8">
              <Spinner aria-label={DIRECTORY_LOADING_LABEL} />
            </div>
          ) : fileError ? (
            <p className="py-8 text-center text-sm text-danger">{fileError}</p>
          ) : path ? (
            <SkillFileBody
              path={path}
              content={content}
              previewable={previewable}
              onCopy={onCopyContent}
              {...(onDownloadFile
                ? { onDownload: () => void onDownloadFile(detail.id, path) }
                : {})}
            />
          ) : null}
        </section>
      </div>

      {editable && onDelete ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{SKILL_DELETE_HINT}</p>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center rounded-md border border-border px-3 text-sm text-danger transition-colors motion-reduce:transition-none hover:bg-muted disabled:opacity-50',
              DIRECTORY_FOCUS_RING,
            )}
          >
            {SKILL_DELETE_LABEL}
          </button>
        </div>
      ) : null}
    </div>
  );
}
