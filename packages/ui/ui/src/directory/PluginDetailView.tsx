'use client';

import { Check, Copy, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import { Switch } from '../primitives/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../primitives/Tabs';
import {
  CONNECT_LABEL,
  INSTALLED_LABEL,
  INSTALL_LABEL,
  PLUGIN_CONNECTORS_TAB_COPY,
  PLUGIN_CONNECTORS_TAB_EMPTY,
  PLUGIN_CONNECTORS_TAB_LABEL,
  PLUGIN_CONNECTOR_CONNECTED_LABEL,
  PLUGIN_CONNECTOR_MISSING_LABEL,
  PLUGIN_LAST_UPDATED_LABEL,
  PLUGIN_SKILLS_TAB_COPY,
  PLUGIN_SKILLS_TAB_EMPTY,
  PLUGIN_SKILLS_TAB_LABEL,
  PLUGIN_SKILL_SLASH_PREFIX,
  PLUGIN_SOURCE_LABEL,
  PLUGIN_TABS_LABEL,
  PLUGIN_ENABLED_HINT,
  PLUGIN_ENABLED_LABEL,
  PLUGIN_SETTINGS_LOADING_LABEL,
  PLUGIN_SKILL_TOGGLE_PREFIX,
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
  DIRECTORY_CREATE_BUTTON,
  DIRECTORY_FOCUS_RING,
  DIRECTORY_ICON_BUTTON,
} from './styles';
import type {
  DirectoryPluginComponents,
  DirectoryPluginDetail,
  DirectoryPluginSettings,
} from './types';

const EMPTY_VALUES: readonly string[] = [];

function formatUpdatedAt(value: string | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString();
}
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
  skillsListedElsewhere: boolean,
): { label: string; body: ReactNode }[] {
  const rows: { label: string; body: ReactNode }[] = [];
  if (components.skills.length > 0 && !skillsListedElsewhere) {
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

function ComponentsSummary({
  components,
  skillsListedElsewhere,
}: {
  components: DirectoryPluginComponents;
  skillsListedElsewhere: boolean;
}) {
  const rows = componentRows(components, skillsListedElsewhere);
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

const SETTINGS_ROW_CLASS =
  'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5';

function EnabledRow({
  id,
  enabled,
  busy,
  onSetEnabled,
}: {
  id: string;
  enabled: boolean;
  busy: boolean;
  onSetEnabled: (enabled: boolean) => Promise<void> | void;
}) {
  const switchId = `plugin-enabled-${id}`;
  return (
    <div className={SETTINGS_ROW_CLASS}>
      <label htmlFor={switchId} className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{PLUGIN_ENABLED_LABEL}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{PLUGIN_ENABLED_HINT}</span>
      </label>
      <Switch
        id={switchId}
        checked={enabled}
        disabled={busy}
        onCheckedChange={(checked) => void onSetEnabled(checked)}
        aria-label={PLUGIN_ENABLED_LABEL}
      />
    </div>
  );
}

const TAB_SKILLS = 'skills';
const TAB_CONNECTORS = 'connectors';

function SkillRows({
  settings,
  onSetSkillEnabled,
}: {
  settings: DirectoryPluginSettings;
  onSetSkillEnabled?: (skill: string, enabled: boolean) => Promise<void> | void;
}) {
  if (settings.skills.length === 0) {
    return <p className="text-sm text-muted-foreground">{PLUGIN_SKILLS_TAB_EMPTY}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {settings.skills.map((skill) => {
        const switchId = `plugin-skill-${settings.pluginId}-${skill.name}`;
        return (
          <li key={skill.name} className={SETTINGS_ROW_CLASS}>
            <label htmlFor={switchId} className="min-w-0 flex-1">
              <span className="block truncate font-mono text-xs text-foreground">
                {`${PLUGIN_SKILL_SLASH_PREFIX}${skill.name}`}
              </span>
              {skill.description ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {skill.description}
                </span>
              ) : null}
            </label>
            <Switch
              id={switchId}
              checked={skill.enabled}
              disabled={settings.saving || !onSetSkillEnabled}
              onCheckedChange={(checked) => void onSetSkillEnabled?.(skill.name, checked)}
              aria-label={`${PLUGIN_SKILL_TOGGLE_PREFIX} ${skill.name}`}
            />
          </li>
        );
      })}
    </ul>
  );
}

function ConnectorRows({
  settings,
  onOpenConnector,
}: {
  settings: DirectoryPluginSettings;
  onOpenConnector?: (connectorId: string) => void;
}) {
  if (settings.connectors.length === 0) {
    return <p className="text-sm text-muted-foreground">{PLUGIN_CONNECTORS_TAB_EMPTY}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {settings.connectors.map((connector) => (
        <li key={connector.id} className={SETTINGS_ROW_CLASS}>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{connector.name}</span>
          {connector.connected ? (
            <span className="shrink-0 text-xs text-success-text">
              {PLUGIN_CONNECTOR_CONNECTED_LABEL}
            </span>
          ) : onOpenConnector ? (
            <button
              type="button"
              onClick={() => onOpenConnector(connector.id)}
              className={cn(DIRECTORY_CREATE_BUTTON, 'shrink-0')}
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
  );
}

function ContentsTabs({
  settings,
  onSetSkillEnabled,
  onOpenConnector,
}: {
  settings: DirectoryPluginSettings;
  onSetSkillEnabled?: (skill: string, enabled: boolean) => Promise<void> | void;
  onOpenConnector?: (connectorId: string) => void;
}) {
  if (settings.loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size="sm" aria-label={PLUGIN_SETTINGS_LOADING_LABEL} />
      </div>
    );
  }
  if (settings.error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-danger"
      >
        {settings.error}
      </p>
    );
  }
  if (settings.skills.length === 0 && settings.connectors.length === 0) return null;
  return (
    <Tabs defaultValue={settings.skills.length > 0 ? TAB_SKILLS : TAB_CONNECTORS}>
      <TabsList aria-label={PLUGIN_TABS_LABEL}>
        <TabsTrigger value={TAB_SKILLS}>{PLUGIN_SKILLS_TAB_LABEL}</TabsTrigger>
        <TabsTrigger value={TAB_CONNECTORS}>{PLUGIN_CONNECTORS_TAB_LABEL}</TabsTrigger>
      </TabsList>
      <TabsContent value={TAB_SKILLS} className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{PLUGIN_SKILLS_TAB_COPY}</p>
        <SkillRows settings={settings} onSetSkillEnabled={onSetSkillEnabled} />
      </TabsContent>
      <TabsContent value={TAB_CONNECTORS} className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{PLUGIN_CONNECTORS_TAB_COPY}</p>
        <ConnectorRows settings={settings} onOpenConnector={onOpenConnector} />
      </TabsContent>
    </Tabs>
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
  settings,
  onSetEnabled,
  onSetSkillEnabled,
  onOpenConnector,
  busy,
}: {
  detail: DirectoryPluginDetail;
  onBack: () => void;
  onInstall?: () => void;
  onUninstall?: () => void;
  onCopyLink?: () => void;
  onCopyValue?: (value: string) => Promise<void> | void;
  onOpenHref?: (href: string) => Promise<void> | void;
  settings?: DirectoryPluginSettings;
  onSetEnabled?: (enabled: boolean) => Promise<void> | void;
  onSetSkillEnabled?: (skill: string, enabled: boolean) => Promise<void> | void;
  onOpenConnector?: (connectorId: string) => void;
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
  const updated = formatUpdatedAt(detail.updatedAt);
  const showsTabs = installed && settings !== undefined;

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

      {installed && onSetEnabled ? (
        <EnabledRow
          id={detail.id}
          enabled={detail.enabled !== false}
          busy={busy === true || settings?.saving === true}
          onSetEnabled={onSetEnabled}
        />
      ) : null}

      {showsTabs ? (
        <ContentsTabs
          settings={settings}
          onSetSkillEnabled={onSetSkillEnabled}
          onOpenConnector={onOpenConnector}
        />
      ) : null}

      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {detail.description}
      </p>

      {detail.components ? (
        <ComponentsSummary components={detail.components} skillsListedElsewhere={showsTabs} />
      ) : null}

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

      {worksWith.length > 0 ||
      detail.version ||
      detail.sourceLabel ||
      updated ||
      moreInfo.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            {detail.sourceLabel ? (
              <DetailRow label={PLUGIN_SOURCE_LABEL}>
                {detail.sourceUrl ? (
                  <OutboundLink href={detail.sourceUrl} onOpenHref={onOpenHref}>
                    {detail.sourceLabel}
                  </OutboundLink>
                ) : (
                  detail.sourceLabel
                )}
              </DetailRow>
            ) : null}
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
            {updated ? <DetailRow label={PLUGIN_LAST_UPDATED_LABEL}>{updated}</DetailRow> : null}
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
