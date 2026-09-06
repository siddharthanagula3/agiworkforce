'use client';

import { useEffect, useMemo, useState } from 'react';

import { Spinner } from '../primitives/Spinner';
import {
  DIRECTORY_LOADING_LABEL,
  GENERIC_ERROR_COPY,
  INSTALLED_LABEL,
  INSTALL_LABEL,
  SKILL_DESCRIPTION_LABEL,
  SKILL_LICENSE_LABEL,
  UNINSTALL_LABEL,
} from './constants';
import { DirectoryBackLink, DirectoryDetailHeader } from './DirectoryDetailHeader';
import { isTextFile } from './highlight';
import { SkillFileBody, SkillFileTree } from './SkillFileViewer';
import type { DirectorySkillDetail } from './types';

export function SkillDetailView({
  detail,
  onBack,
  onInstall,
  onUninstall,
  onOpenSettings,
  onCopyLink,
  onCopyContent,
  onDownloadFile,
  busy,
}: {
  detail: DirectorySkillDetail;
  onBack: () => void;
  onInstall?: () => void;
  onUninstall?: () => void;
  onOpenSettings?: () => void;
  onCopyLink?: () => void;
  onCopyContent?: (content: string) => void;
  onDownloadFile?: (skillId: string, path: string) => Promise<void> | void;
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
        setFileError(caught instanceof Error ? caught.message : GENERIC_ERROR_COPY);
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

  return (
    <div className="flex flex-col gap-4">
      <DirectoryBackLink onBack={onBack} />
      <DirectoryDetailHeader
        title={detail.name}
        name={detail.name}
        subtitle={detail.publisher}
        primaryLabel={editable ? INSTALLED_LABEL : installed ? UNINSTALL_LABEL : INSTALL_LABEL}
        primaryDone={editable}
        primarySecondary={installed}
        onPrimary={editable ? undefined : installed ? onUninstall : onInstall}
        onOpenSettings={editable ? onOpenSettings : undefined}
        onCopyLink={onCopyLink}
        busy={busy}
      />

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
    </div>
  );
}
