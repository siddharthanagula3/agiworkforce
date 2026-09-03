'use client';

import { Copy, Eye, FileText, Folder, Code2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import {
  INSTALLED_LABEL,
  INSTALL_LABEL,
  SKILL_COPY_LABEL,
  SKILL_DESCRIPTION_LABEL,
  SKILL_FILES_LABEL,
  SKILL_LICENSE_LABEL,
  SKILL_RAW_LABEL,
  SKILL_RENDERED_LABEL,
  DIRECTORY_LOADING_LABEL,
  GENERIC_ERROR_COPY,
} from './constants';
import { buildFileTree } from './filtering';
import { DirectoryBackLink, DirectoryDetailHeader } from './DirectoryDetailHeader';
import { DIRECTORY_FOCUS_RING, DIRECTORY_ICON_BUTTON } from './styles';
import type { DirectorySkillDetail } from './types';

const INDENT_REM_PER_LEVEL = 0.75;

function RenderedBody({ content }: { content: string }) {
  const paragraphs = useMemo(
    () =>
      content
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean),
    [content],
  );
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export function SkillDetailView({
  detail,
  onBack,
  onInstall,
  onOpenSettings,
  onRemove,
  onCopyLink,
  onCopyContent,
  busy,
}: {
  detail: DirectorySkillDetail;
  onBack: () => void;
  onInstall?: () => void;
  onOpenSettings?: () => void;
  onRemove?: () => void;
  onCopyLink?: () => void;
  onCopyContent?: (content: string) => void;
  busy?: boolean;
}) {
  const tree = useMemo(() => buildFileTree(detail.files), [detail.files]);
  const firstFile = detail.files[0]?.path ?? '';
  const [selectedPath, setSelectedPath] = useState(firstFile);
  const [raw, setRaw] = useState(false);

  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const selected = detail.files.find((file) => file.path === selectedPath) ?? detail.files[0];
  const isEntryFile = selected?.path === firstFile;
  const selectedPathValue = selected?.path;
  const inlineContent = selected?.content;
  const content = inlineContent ?? (selectedPathValue ? loaded[selectedPathValue] : undefined);
  const readFile = detail.readFile;

  useEffect(() => {
    if (!selectedPathValue || inlineContent !== undefined) return;
    if (!readFile || loaded[selectedPathValue] !== undefined) return;
    let cancelled = false;
    setFileLoading(true);
    setFileError(null);
    void readFile(selectedPathValue)
      .then((text) => {
        if (!cancelled) setLoaded((prev) => ({ ...prev, [selectedPathValue]: text }));
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
  }, [selectedPathValue, inlineContent, readFile, loaded]);

  return (
    <div className="flex flex-col gap-4">
      <DirectoryBackLink onBack={onBack} />
      <DirectoryDetailHeader
        title={detail.name}
        name={detail.name}
        subtitle={detail.publisher}
        primaryLabel={detail.installed ? INSTALLED_LABEL : INSTALL_LABEL}
        primaryDone={detail.installed === true}
        onPrimary={onInstall}
        onOpenSettings={onOpenSettings}
        onRemove={onRemove}
        onCopyLink={onCopyLink}
        busy={busy}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <nav aria-label={SKILL_FILES_LABEL} className="flex flex-col gap-0.5">
          {tree.map((node) => {
            const Icon = node.kind === 'folder' ? Folder : FileText;
            const active = node.path === selected?.path;
            if (node.kind === 'folder') {
              return (
                <span
                  key={node.path}
                  style={{ paddingLeft: `${node.depth * INDENT_REM_PER_LEVEL}rem` }}
                  className="inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground"
                >
                  <Icon aria-hidden className="size-3.5" />
                  {node.label}
                </span>
              );
            }
            return (
              <button
                key={node.path}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setSelectedPath(node.path)}
                style={{ paddingLeft: `${node.depth * INDENT_REM_PER_LEVEL}rem` }}
                className={cn(
                  'inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {node.label}
              </button>
            );
          })}
        </nav>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            {isEntryFile ? (
              <dl className="min-w-0 flex-1 text-sm">
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
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                {selected?.path}
              </p>
            )}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-pressed={!raw}
                aria-label={SKILL_RENDERED_LABEL}
                onClick={() => setRaw(false)}
                className={cn(
                  DIRECTORY_ICON_BUTTON,
                  !raw && 'bg-muted text-foreground',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                <Eye aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                aria-pressed={raw}
                aria-label={SKILL_RAW_LABEL}
                onClick={() => setRaw(true)}
                className={cn(
                  DIRECTORY_ICON_BUTTON,
                  raw && 'bg-muted text-foreground',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                <Code2 aria-hidden className="size-4" />
              </button>
              {onCopyContent && content !== undefined ? (
                <button
                  type="button"
                  aria-label={SKILL_COPY_LABEL}
                  onClick={() => onCopyContent(content)}
                  className={cn(DIRECTORY_ICON_BUTTON, DIRECTORY_FOCUS_RING)}
                >
                  <Copy aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
          {fileLoading ? (
            <div className="flex justify-center py-8">
              <Spinner aria-label={DIRECTORY_LOADING_LABEL} />
            </div>
          ) : fileError ? (
            <p className="py-8 text-center text-sm text-danger">{fileError}</p>
          ) : raw ? (
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
              {content}
            </pre>
          ) : (
            <RenderedBody content={content ?? ''} />
          )}
        </section>
      </div>
    </div>
  );
}
