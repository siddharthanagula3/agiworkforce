'use client';

import { Check, Copy, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import {
  INSTALLED_LABEL,
  INSTALL_LABEL,
  PLUGIN_AGENTS_LABEL,
  PLUGIN_COMMANDS_LABEL,
  PLUGIN_COMMAND_COPIED_LABEL,
  PLUGIN_COMMAND_COPIED_RESET_MS,
  PLUGIN_COMPONENTS_HEADING,
  PLUGIN_DESKTOP_ONLY_LABEL,
  PLUGIN_HOMEPAGE_LABEL,
  PLUGIN_HOOKS_LABEL,
  PLUGIN_HOOKS_VALUE,
  PLUGIN_INSTALLS_SUFFIX,
  PLUGIN_INSTALL_COMMAND_COPY_LABEL,
  PLUGIN_INSTALL_COMMAND_LABEL,
  PLUGIN_LSP_SERVERS_LABEL,
  PLUGIN_MARKETPLACE_LABEL,
  PLUGIN_MCP_SERVERS_LABEL,
  PLUGIN_MCP_TRANSPORT_SEPARATOR,
  PLUGIN_MORE_INFO_LABEL,
  PLUGIN_PROMPTS_LABEL,
  PLUGIN_REPOSITORY_LABEL,
  PLUGIN_SKILLS_LABEL,
  PLUGIN_VERSION_LABEL,
  PLUGIN_WORKS_WITH_LABEL,
  UNINSTALL_LABEL,
  VERIFIED_GLYPH_BADGE,
} from './constants';
import { DirectoryBadge } from './DirectoryBadges';
import {
  DetailMonogram,
  DirectoryBackLink,
  DirectoryDetailHeader,
  OutboundLink,
} from './DirectoryDetailHeader';
import { formatInstallCount } from './filtering';
import {
  DETAIL_HEADER_BAND,
  DETAIL_HEADING,
  DETAIL_LABEL,
  DIRECTORY_FOCUS_RING,
  DIRECTORY_ICON_BUTTON,
} from './styles';
import type { DirectoryPluginComponents, DirectoryPluginDetail } from './types';

const EMPTY_VALUES: readonly string[] = [];
const CHIP_CLASS = 'rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground';
const MONO_CHIP_CLASS =
  'truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className={DETAIL_LABEL}>{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function MonoList({ values }: { values: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <li key={value} className={MONO_CHIP_CLASS} title={value}>
          {value}
        </li>
      ))}
    </ul>
  );
}

function componentRows(
  components: DirectoryPluginComponents,
): { label: string; body: ReactNode }[] {
  const rows: { label: string; body: ReactNode }[] = [];
  if (components.skills.length > 0) {
    rows.push({ label: PLUGIN_SKILLS_LABEL, body: <MonoList values={components.skills} /> });
  }
  if (components.commands > 0) {
    rows.push({ label: PLUGIN_COMMANDS_LABEL, body: String(components.commands) });
  }
  if (components.agents > 0) {
    rows.push({ label: PLUGIN_AGENTS_LABEL, body: String(components.agents) });
  }
  if (components.mcpServers.length > 0) {
    rows.push({
      label: PLUGIN_MCP_SERVERS_LABEL,
      body: (
        <MonoList
          values={components.mcpServers.map(
            (server) => `${server.name}${PLUGIN_MCP_TRANSPORT_SEPARATOR}${server.transport}`,
          )}
        />
      ),
    });
  }
  if (components.hooks) rows.push({ label: PLUGIN_HOOKS_LABEL, body: PLUGIN_HOOKS_VALUE });
  if (components.lspServers.length > 0) {
    rows.push({
      label: PLUGIN_LSP_SERVERS_LABEL,
      body: <MonoList values={components.lspServers} />,
    });
  }
  return rows;
}

function ComponentsSummary({ components }: { components: DirectoryPluginComponents }) {
  const rows = componentRows(components);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h4 className={DETAIL_HEADING}>{PLUGIN_COMPONENTS_HEADING}</h4>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {rows.map((row) => (
          <DetailRow key={row.label} label={row.label}>
            {row.body}
          </DetailRow>
        ))}
      </dl>
    </section>
  );
}

function InstallFromCli({
  note,
  command,
  onCopyValue,
}: {
  note?: string | null;
  command?: string | null;
  onCopyValue?: (value: string) => Promise<void> | void;
}) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    },
    [],
  );
  if (!note && !command) return null;
  const copy = () => {
    if (!command || !onCopyValue) return;
    void Promise.resolve(onCopyValue(command)).then(() => {
      setCopied(true);
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), PLUGIN_COMMAND_COPIED_RESET_MS);
    });
  };
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3">
      <Terminal aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{PLUGIN_INSTALL_COMMAND_LABEL}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        {command ? (
          <div className="flex items-center gap-1 rounded-md border border-border bg-background py-1 pl-2.5 pr-1">
            <code
              data-testid="plugin-install-command"
              className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
            >
              {command}
            </code>
            {onCopyValue ? (
              <button
                type="button"
                onClick={copy}
                aria-label={PLUGIN_INSTALL_COMMAND_COPY_LABEL}
                title={copied ? PLUGIN_COMMAND_COPIED_LABEL : PLUGIN_INSTALL_COMMAND_COPY_LABEL}
                className={cn(DIRECTORY_ICON_BUTTON, DIRECTORY_FOCUS_RING)}
              >
                {copied ? (
                  <Check aria-hidden className="size-3.5 text-success-text" />
                ) : (
                  <Copy aria-hidden className="size-3.5" />
                )}
              </button>
            ) : null}
            <span role="status" className="sr-only">
              {copied ? PLUGIN_COMMAND_COPIED_LABEL : ''}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PluginDetailView({
  detail,
  onBack,
  onInstall,
  onUninstall,
  onCopyLink,
  onCopyValue,
  onOpenHref,
  busy,
}: {
  detail: DirectoryPluginDetail;
  onBack: () => void;
  onInstall?: () => void;
  onUninstall?: () => void;
  onCopyLink?: () => void;
  onCopyValue?: (value: string) => Promise<void> | void;
  onOpenHref?: (href: string) => Promise<void> | void;
  busy?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const shownIdRef = useRef(detail.id);
  useEffect(() => {
    if (shownIdRef.current === detail.id) return;
    shownIdRef.current = detail.id;
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, [detail.id]);

  const installed = detail.installed === true;
  const installable = detail.installable !== false;
  const count = formatInstallCount(detail.installCount);
  const worksWith = detail.worksWith ?? EMPTY_VALUES;
  const moreInfo: { label: string; href: string }[] = [
    { label: PLUGIN_HOMEPAGE_LABEL, href: detail.homepageUrl ?? '' },
    { label: PLUGIN_REPOSITORY_LABEL, href: detail.repositoryUrl ?? '' },
    {
      label: detail.marketplaceName ?? PLUGIN_MARKETPLACE_LABEL,
      href: detail.marketplaceUrl ?? '',
    },
  ].filter(
    (row, index, rows) =>
      row.href.length > 0 && rows.findIndex((r) => r.href === row.href) === index,
  );
  const showCli = !installed && !installable;

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      <DirectoryBackLink onBack={onBack} />
      <div className={DETAIL_HEADER_BAND}>
        <DirectoryDetailHeader
          title={detail.name}
          name={detail.name}
          icon={<DetailMonogram monogram={detail.name.slice(0, 1).toUpperCase()} />}
          badge={detail.verified ? <DirectoryBadge badge={VERIFIED_GLYPH_BADGE} /> : null}
          subtitle={
            detail.publisher || count ? (
              <span className="flex flex-wrap items-center gap-x-1.5">
                {detail.publisher ? <span>{detail.publisher}</span> : null}
                {detail.publisher && count ? <span aria-hidden>&middot;</span> : null}
                {count ? (
                  <span>
                    <span className="font-mono">{count}</span> {PLUGIN_INSTALLS_SUFFIX}
                  </span>
                ) : null}
              </span>
            ) : undefined
          }
          primaryLabel={installed ? INSTALLED_LABEL : INSTALL_LABEL}
          primaryDone={installed}
          onPrimary={installable ? onInstall : undefined}
          statusNote={showCli ? (detail.availabilityNote ?? PLUGIN_DESKTOP_ONLY_LABEL) : undefined}
          {...(installed && onUninstall
            ? { onRemove: onUninstall, removeLabel: UNINSTALL_LABEL }
            : {})}
          onCopyLink={onCopyLink}
          busy={busy}
        />
      </div>

      {showCli ? (
        <InstallFromCli
          note={detail.runtimeNote}
          command={detail.installCommand}
          onCopyValue={onCopyValue}
        />
      ) : null}

      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {detail.description}
      </p>

      {detail.components ? <ComponentsSummary components={detail.components} /> : null}

      {detail.examplePrompts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h4 className={DETAIL_HEADING}>{PLUGIN_PROMPTS_LABEL}</h4>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
            {detail.examplePrompts.map((prompt) => (
              <li key={prompt} className="bg-card px-3 py-2.5 text-sm text-foreground">
                {prompt}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {worksWith.length > 0 || detail.version || moreInfo.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            {worksWith.length > 0 ? (
              <DetailRow label={PLUGIN_WORKS_WITH_LABEL}>
                <ul className="flex flex-wrap gap-1.5">
                  {worksWith.map((value) => (
                    <li key={value} className={CHIP_CLASS}>
                      {value}
                    </li>
                  ))}
                </ul>
              </DetailRow>
            ) : null}
            {detail.version ? (
              <DetailRow label={PLUGIN_VERSION_LABEL}>
                <span className="font-mono text-xs">{detail.version}</span>
              </DetailRow>
            ) : null}
          </div>
          {moreInfo.length > 0 ? (
            <DetailRow label={PLUGIN_MORE_INFO_LABEL}>
              <ul className="flex flex-col gap-1.5">
                {moreInfo.map((row) => (
                  <li key={row.label}>
                    <OutboundLink href={row.href} onOpenHref={onOpenHref}>
                      {row.label}
                    </OutboundLink>
                  </li>
                ))}
              </ul>
            </DetailRow>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
