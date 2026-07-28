'use client';

/**
 * SettingsModal — shared modal shell for AGI Web (and AGI Desktop via activeKeys).
 *
 * BOUNDARY: pure presentation + navigation. No fetch, no store, no
 * next/navigation, no @tauri-apps. All data and per-section content is
 * injected via props (sectionContent map for rendered sections, adapter for
 * connectors/skills/plugins data).
 *
 * Layout (matches Claude.ai reference 403-416):
 *   Left column (~220px): "Settings" title + search + flat nav list (no group headers)
 *   Right column: section pane rendered from sectionContent or built-in panels
 *
 * Nav items: General, Account, Security, Privacy, Billing, Usage,
 *            Capabilities, Connectors, Skills, Plugins, Memory, Notifications
 *            (surface trims via activeKeys)
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  X,
  Search,
  Check,
  Settings2,
  UserCircle,
  Shield,
  CreditCard,
  BarChart3,
  Zap,
  Plug,
  BookOpen,
  Puzzle,
  Brain,
  Bell,
  Lock,
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  Plus,
  Loader2,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../cn';
import { Menu, MenuItem } from '../sidebar/Menu';
import type {
  SettingsDataAdapter,
  SettingsConnector,
  SettingsSkill,
  ConnectedConnector,
} from './types';
import { SETTINGS_NAV_KEYWORDS } from '../settings-nav';
import type { SettingsNavGroupResolved, SettingsNavKey } from '../settings-nav';
import { ConnectorLogo } from './ConnectorLogo';

// ---------------------------------------------------------------------------
// Nav config — flat list, no group headers (matches Claude reference)
// ---------------------------------------------------------------------------

interface NavEntry {
  key: string;
  label: string;
  icon: LucideIcon;
}

/**
 * AUDIT-FIX PAR-16: nav search matched the visible label only, so the aliases
 * the repo already authored on SETTINGS_NAV.keywords never applied — searching
 * the obvious term ("theme", "shortcuts", "invoice") returned no results.
 */
function matchesNavFilter(
  entry: { key: string; label: string; keywords?: string[] },
  filter: string,
): boolean {
  if (entry.label.toLowerCase().includes(filter)) return true;
  const keywords = entry.keywords ?? SETTINGS_NAV_KEYWORDS[entry.key as SettingsNavKey] ?? [];
  return keywords.some((keyword) => keyword.toLowerCase().includes(filter));
}

const ALL_NAV_ENTRIES: NavEntry[] = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'account', label: 'Account', icon: UserCircle },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'privacy', label: 'Privacy', icon: Shield },
  { key: 'billing', label: 'Billing', icon: CreditCard },
  { key: 'usage', label: 'Usage', icon: BarChart3 },
  { key: 'capabilities', label: 'Capabilities', icon: Zap },
  { key: 'connectors', label: 'Connectors', icon: Plug },
  { key: 'skills', label: 'Skills', icon: BookOpen },
  { key: 'plugins', label: 'Plugins', icon: Puzzle },
  { key: 'memory', label: 'Memory', icon: Brain },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

// ---------------------------------------------------------------------------
// ConnectorsPanel — table view matching the claude.ai Directory references
// (251-256): filter tabs All | Connected | Not connected, columns
// Connector / Type / Status, search, and an in-place detail view.
//
// HONESTY RULES (docs/agent-context/known-flaws.md WEB-CONNECTORS row):
//   - Statuses come ONLY from the adapter's real connection state.
//   - A Connect button renders ONLY when the surface says the connect flow can
//     actually complete (connector.canConnect + adapter.connectConnector);
//     otherwise the row shows the surface-supplied statusLabel. No dead
//     Connect buttons, no fabricated availability.
//   - Amber warning states render only when the adapter supplies a real
//     status === 'warning' signal; there is no synthetic health data.
// ---------------------------------------------------------------------------

type ConnectorTab = 'all' | 'connected' | 'not-connected';

const CONNECTOR_TABS: { key: ConnectorTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'connected', label: 'Connected' },
  { key: 'not-connected', label: 'Not connected' },
];

function ConnectorStatusCell({
  connector,
  connection,
  canConnect,
  mutating,
  onConnect,
}: {
  connector: SettingsConnector;
  connection: ConnectedConnector | undefined;
  canConnect: boolean;
  mutating: boolean;
  onConnect: () => void;
}) {
  if (connection) {
    if (connection.status === 'warning') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {connection.warningLabel ?? 'Connection issue'}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20">
          <Check className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
        Connected
      </span>
    );
  }
  if (canConnect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onConnect();
        }}
        disabled={mutating}
        aria-label={`Connect ${connector.name}`}
        className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        {mutating ? '...' : 'Connect'}
      </button>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {connector.statusLabel ?? 'Not connected'}
    </span>
  );
}

function ConnectorDetail({
  connector,
  connection,
  canConnect,
  mutating,
  onConnect,
  onDisconnect,
  onBack,
  error,
}: {
  connector: SettingsConnector;
  connection: ConnectedConnector | undefined;
  canConnect: boolean;
  mutating: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onBack: () => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ConnectorLogo
            connectorId={connector.id}
            fallbackGradient={connector.iconBg}
            fallbackText={connector.iconText}
            size="lg"
          />
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <span className="truncate">{connector.name}</span>
              {connection && connection.status !== 'warning' && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                  <Check className="h-2.5 w-2.5 text-emerald-500" aria-hidden="true" />
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">{connector.category}</p>
          </div>
        </div>
        <div className="shrink-0">
          {connection ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={mutating}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {mutating ? '...' : 'Disconnect'}
            </button>
          ) : canConnect ? (
            <button
              type="button"
              onClick={onConnect}
              disabled={mutating}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {mutating ? '...' : 'Connect'}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {connector.statusLabel ?? 'Not connected'}
            </span>
          )}
        </div>
      </div>

      {connection?.status === 'warning' && (
        <p className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {connection.warningLabel ?? 'Connection issue'}
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}

      <p className="text-sm leading-relaxed text-muted-foreground">{connector.description}</p>

      {/* Details — real catalog metadata only (no invented author/URL/docs). */}
      <div className="rounded-lg border border-border/80">
        <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold text-foreground">
          Details
        </div>
        <dl className="divide-y divide-border/60 text-xs">
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="text-foreground">{connector.category}</dd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Authentication</dt>
            <dd className="uppercase text-foreground">{connector.authType.replace('_', ' ')}</dd>
          </div>
          {connector.actionCount > 0 && (
            <div className="flex items-center justify-between px-3 py-2">
              <dt className="text-muted-foreground">Actions</dt>
              <dd className="text-foreground">{connector.actionCount}</dd>
            </div>
          )}
          {connection?.connectedAt && (
            <div className="flex items-center justify-between px-3 py-2">
              <dt className="text-muted-foreground">Connected</dt>
              <dd className="text-foreground">
                {new Date(connection.connectedAt).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useConnectorMutations — shared connect/disconnect runner with per-id
// in-flight state and honest per-id error surfacing (failures render inline,
// never as silent optimistic rollbacks).
// ---------------------------------------------------------------------------

function useConnectorMutations(adapter?: SettingsDataAdapter) {
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (id: string, action: ((cid: string) => Promise<void> | void) | undefined) => {
      if (!action) return;
      setMutatingIds((prev) => new Set([...prev, id]));
      setErrors((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        await action(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong. Try again.';
        setErrors((prev) => ({ ...prev, [id]: message }));
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const connect = useCallback(
    (id: string) => void run(id, adapter?.connectConnector),
    [adapter?.connectConnector, run],
  );
  const disconnect = useCallback(
    (id: string) => void run(id, adapter?.disconnectConnector),
    [adapter?.disconnectConnector, run],
  );

  return { mutatingIds, errors, connect, disconnect };
}

// ---------------------------------------------------------------------------
// skillAuthorLabel — honest projection of the real Skill.source field.
// Personal/project/workspace layers are authored by the user; bundled skills
// ship with the product. No other author metadata exists, so nothing else is
// shown (no invented vendor names).
// ---------------------------------------------------------------------------

function skillAuthorLabel(source: string): string {
  switch (source) {
    case 'personal':
    case 'project':
    case 'workspace':
      return 'You';
    case 'bundled':
      return 'AGI';
    case 'managed-local':
      return 'Managed';
    default:
      return source;
  }
}

// ---------------------------------------------------------------------------
// DirectoryBrowse — the shared Directory-style browse view (claude.ai refs
// 251-256) reached from the Connectors "Add > Browse connectors" item and the
// Skills "Browse" button. Tabs render ONLY real content: the connector
// catalog and the loaded skill list (a Plugins tab appears only when the
// adapter actually has plugins). Deliberately NO download counts, popularity
// ranks, or partner cards — we have no such metrics (honesty rule).
// ---------------------------------------------------------------------------

type BrowseTab = 'connectors' | 'skills' | 'plugins';

function DirectoryBrowse({
  adapter,
  initialTab,
  onBack,
  onOpenConnector,
}: {
  adapter?: SettingsDataAdapter;
  initialTab: BrowseTab;
  onBack: () => void;
  /** Opens the connector detail view (gear on installed cards). Optional. */
  onOpenConnector?: (id: string) => void;
}) {
  const [tab, setTab] = useState<BrowseTab>(initialTab);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'az' | 'za'>('az');
  const [category, setCategory] = useState('All');
  const { mutatingIds, errors, connect } = useConnectorMutations(adapter);

  const connectors = useMemo(
    () => (adapter?.connectors ?? []).filter((c) => !c.exclusive),
    [adapter?.connectors],
  );
  const connectionById = useMemo(() => {
    const map = new Map<string, ConnectedConnector>();
    for (const c of adapter?.connectedConnectors ?? []) map.set(c.connectorId, c);
    return map;
  }, [adapter?.connectedConnectors]);
  const skills = adapter?.skills ?? [];
  const hasPluginDirectory =
    adapter != null && ('pluginCatalog' in adapter || 'plugins' in adapter);
  const plugins = adapter?.pluginCatalog ?? adapter?.plugins ?? [];
  const connectorsLoading = adapter?.connectorsLoading ?? false;
  const connectorsError = adapter?.connectorsError;
  const skillsLoading = adapter?.skillsLoading ?? false;
  const skillsError = adapter?.skillsError;
  const pluginsLoading = adapter?.pluginsLoading ?? false;

  // Only advertise directory categories implemented by the current surface.
  // An explicitly supplied empty plugin list is still a real plugin surface
  // with an honest empty state; omitting plugin fields means unsupported.
  const tabs: { key: BrowseTab; label: string }[] = [
    { key: 'skills', label: 'Skills' },
    { key: 'connectors', label: 'Connectors' },
    ...(hasPluginDirectory ? [{ key: 'plugins' as const, label: 'Plugins' }] : []),
  ];

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(connectors.map((c) => c.category)))],
    [connectors],
  );

  const q = search.trim().toLowerCase();
  const byName = (a: { name: string }, b: { name: string }) =>
    sort === 'az' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);

  const visibleConnectors = connectors
    .filter((c) => (category === 'All' ? true : c.category === category))
    .filter((c) =>
      q ? c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) : true,
    )
    .sort(byName);
  const visibleSkills = skills
    .filter((s) =>
      q ? s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) : true,
    )
    .sort(byName);
  const visiblePlugins = plugins
    .filter((pl) =>
      q ? pl.name.toLowerCase().includes(q) || pl.description.toLowerCase().includes(q) : true,
    )
    .sort(byName);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <div>
        <h2 className="text-base font-semibold text-foreground">Browse directory</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasPluginDirectory
            ? 'Explore skills, connectors, and plugins available in this environment.'
            : 'Explore skills and connectors available in this environment.'}
        </p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Directory sections" className="flex items-center gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              tab === t.key
                ? 'bg-foreground text-background'
                : 'border border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + filter + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder={tab === 'connectors' ? 'Search connectors...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {tab === 'connectors' && (
          <select
            aria-label="Filter by type"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 shrink-0 rounded-lg border border-border bg-muted/30 px-2 text-xs text-foreground outline-none"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'az' ? 'za' : 'az'))}
          aria-label={sort === 'az' ? 'Sort Z to A' : 'Sort A to Z'}
          className="h-8 shrink-0 rounded-lg border border-border bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          {sort === 'az' ? 'A-Z' : 'Z-A'}
        </button>
      </div>

      {/* Card grids */}
      {tab === 'connectors' &&
        (connectorsLoading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading connectors…
          </p>
        ) : connectorsError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-500">{connectorsError}</p>
            {adapter?.retryConnectors ? (
              <button
                type="button"
                className="mt-3 text-xs font-medium text-foreground underline underline-offset-2"
                onClick={() => void adapter.retryConnectors?.()}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : visibleConnectors.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No connectors match.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleConnectors.map((connector) => {
              const connection = connectionById.get(connector.id);
              const canConnect = Boolean(connector.canConnect && adapter?.connectConnector);
              const mutating = mutatingIds.has(connector.id);
              const error = errors[connector.id];
              return (
                <div
                  key={connector.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card/40 p-3.5 transition-colors hover:bg-card/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ConnectorLogo
                        connectorId={connector.id}
                        fallbackGradient={connector.iconBg}
                        fallbackText={connector.iconText}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {connector.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {connector.category}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {mutating ? (
                        <Loader2
                          className="h-4 w-4 animate-spin text-muted-foreground"
                          aria-label={`Connecting ${connector.name}`}
                        />
                      ) : connection ? (
                        onOpenConnector ? (
                          <button
                            type="button"
                            onClick={() => onOpenConnector(connector.id)}
                            aria-label={`Configure ${connector.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <SettingsIcon className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                            <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                          </span>
                        )
                      ) : canConnect ? (
                        <button
                          type="button"
                          onClick={() => connect(connector.id)}
                          aria-label={`Connect ${connector.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {connector.statusLabel ?? 'Not connected'}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {connector.description}
                  </p>
                  {error && <p className="text-[11px] text-red-500">{error}</p>}
                </div>
              );
            })}
          </div>
        ))}

      {tab === 'skills' &&
        (skillsLoading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading skills…
          </p>
        ) : skillsError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-500">{skillsError}</p>
            {adapter?.retrySkills ? (
              <button
                type="button"
                className="mt-3 text-xs font-medium text-foreground underline underline-offset-2"
                onClick={() => void adapter.retrySkills?.()}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : visibleSkills.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {skills.length === 0 ? 'No skills loaded in this environment.' : 'No skills match.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-card/40 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm text-foreground">/{skill.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {skillAuthorLabel(skill.source)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {skill.description || 'No description.'}
                </p>
              </div>
            ))}
          </div>
        ))}

      {tab === 'plugins' &&
        (pluginsLoading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading plugins…
          </p>
        ) : visiblePlugins.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {plugins.length === 0
              ? 'No plugins available in this environment.'
              : 'No plugins match.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visiblePlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-card/40 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {plugin.name}
                    </span>
                    {plugin.author && (
                      <span className="text-[11px] text-muted-foreground">{plugin.author}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      plugin.enabled
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {plugin.enabled ? 'Enabled' : (plugin.statusLabel ?? 'Disabled')}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {plugin.description || 'No description.'}
                </p>
                {plugin.detailsHref && (
                  <a
                    href={plugin.detailsHref}
                    aria-label={`View ${plugin.name} details`}
                    className="w-fit text-xs font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    View details
                  </a>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddCustomConnectorForm — "Add custom connector" (BETA) form for a remote
// MCP server. Submission goes through adapter.addCustomConnector; surfaces
// without real persistence throw an honest "not yet supported" error which
// renders inline — the form NEVER fakes a success.
// ---------------------------------------------------------------------------

function AddCustomConnectorForm({
  adapter,
  onBack,
}: {
  adapter?: SettingsDataAdapter;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedUrl = url.trim();
  const urlValid = /^https:\/\/.+/.test(trimmedUrl);
  const canSubmit = name.trim().length > 0 && urlValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!adapter?.addCustomConnector) {
        throw new Error('Custom connectors are not yet supported in this environment.');
      }
      await adapter.addCustomConnector({
        name: name.trim(),
        url: trimmedUrl,
        ...(adapter.customConnectorAuthTokenSupported && authToken.trim()
          ? { authToken: authToken.trim() }
          : {}),
      });
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add connector. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring';

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          Add custom connector
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
            Beta
          </span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a remote MCP server to give the assistant new tools.{' '}
          {adapter?.openHref ? (
            <button
              type="button"
              onClick={() => void adapter.openHref?.('/docs')}
              className="text-foreground underline underline-offset-2"
            >
              Learn more
            </button>
          ) : (
            <a href="/docs" className="text-foreground underline underline-offset-2">
              Learn more
            </a>
          )}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My connector"
          className={inputClass}
        />
      </label>

      {adapter?.customConnectorAuthTokenSupported ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">
            Bearer token <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Token is encrypted before storage"
            autoComplete="off"
            className={inputClass}
          />
          <span className="text-[11px] text-muted-foreground">
            Sent only to this MCP server and never shown again.
          </span>
        </label>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">Remote MCP server URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/mcp"
          className={inputClass}
        />
        {trimmedUrl.length > 0 && !urlValid && (
          <span className="text-[11px] text-red-500">Enter a valid https:// URL.</span>
        )}
      </label>

      <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Only use connectors from developers you trust. Custom connectors can read the conversation
        context you share with their tools.
      </p>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  );
}

function ConnectorsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ConnectorTab>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'browse' | 'add-custom'>('table');
  const {
    mutatingIds,
    errors: rowErrors,
    connect: handleConnect,
    disconnect: handleDisconnect,
  } = useConnectorMutations(adapter);

  const catalogConnectors = useMemo(
    () => (adapter?.connectors ?? []).filter((c) => !c.exclusive),
    [adapter?.connectors],
  );
  const connectionById = useMemo(() => {
    const map = new Map<string, ConnectedConnector>();
    for (const c of adapter?.connectedConnectors ?? []) map.set(c.connectorId, c);
    return map;
  }, [adapter?.connectedConnectors]);
  // Keep the primary settings table operational: connected connectors,
  // deployment-ready connectors, and user-added MCP servers. The full preview
  // catalog remains available under Add > Browse connectors, without flooding
  // the everyday pane with dozens of inert "Coming soon" rows.
  const connectors = useMemo(
    () =>
      catalogConnectors.filter(
        (connector) =>
          connectionById.has(connector.id) ||
          connector.canConnect === true ||
          connector.authType === 'custom_mcp',
      ),
    [catalogConnectors, connectionById],
  );
  const loading = adapter?.connectorsLoading ?? false;
  const loadError = adapter?.connectorsError;

  const tabCounts = useMemo(() => {
    let connected = 0;
    for (const c of connectors) if (connectionById.has(c.id)) connected += 1;
    return {
      all: connectors.length,
      connected,
      'not-connected': connectors.length - connected,
    } as Record<ConnectorTab, number>;
  }, [connectors, connectionById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connectors.filter((c) => {
      const isConnected = connectionById.has(c.id);
      if (activeTab === 'connected' && !isConnected) return false;
      if (activeTab === 'not-connected' && isConnected) return false;
      if (q) {
        return (
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [connectors, connectionById, search, activeTab]);

  if (view === 'browse') {
    return (
      <DirectoryBrowse
        adapter={adapter}
        initialTab="connectors"
        onBack={() => setView('table')}
        onOpenConnector={(id) => {
          setView('table');
          setDetailId(id);
        }}
      />
    );
  }

  if (view === 'add-custom') {
    return <AddCustomConnectorForm adapter={adapter} onBack={() => setView('table')} />;
  }

  const detailConnector = detailId ? connectors.find((c) => c.id === detailId) : undefined;
  if (detailConnector) {
    const canConnect = Boolean(detailConnector.canConnect && adapter?.connectConnector);
    return (
      <ConnectorDetail
        connector={detailConnector}
        connection={connectionById.get(detailConnector.id)}
        canConnect={canConnect}
        mutating={mutatingIds.has(detailConnector.id)}
        onConnect={() => handleConnect(detailConnector.id)}
        onDisconnect={() => handleDisconnect(detailConnector.id)}
        onBack={() => setDetailId(null)}
        error={rowErrors[detailConnector.id]}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Connectors</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your tools and give the assistant access to your apps.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading connectors…
        </p>
      ) : loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-500">{loadError}</p>
          {adapter?.retryConnectors ? (
            <button
              type="button"
              className="mt-3 text-xs font-medium text-foreground underline underline-offset-2"
              onClick={() => void adapter.retryConnectors?.()}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* Toolbar: filter tabs (left) + search + Add (right) */}
          <div
            className={cn(
              'flex items-center gap-2 flex-wrap',
              connectors.length > 0 ? 'justify-between' : 'justify-end',
            )}
          >
            {connectors.length > 0 ? (
              <div
                role="tablist"
                aria-label="Filter connectors"
                className="flex items-center gap-1"
              >
                {CONNECTOR_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      activeTab === tab.key
                        ? 'bg-foreground text-background'
                        : 'border border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {tab.label}
                    <span className="ml-1 opacity-60">{tabCounts[tab.key]}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex shrink-0 items-center gap-1.5">
              {connectors.length > 0 ? (
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Search connectors..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ) : null}
              <Menu
                align="end"
                trigger={({ toggle, open }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    className="flex h-8 items-center gap-1 rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
                  >
                    Add
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                menuClassName="w-52"
              >
                {({ close }) => (
                  <>
                    <MenuItem close={close} onSelect={() => setView('browse')}>
                      Browse connectors
                    </MenuItem>
                    <MenuItem close={close} onSelect={() => setView('add-custom')}>
                      Add custom connector
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            connectors.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">Connect your first tool</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Add a trusted remote MCP server now, or browse the directory to see which
                    branded connectors your deployment can enable.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView('add-custom')}
                  disabled={!adapter?.addCustomConnector}
                  className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Connect remote MCP server
                </button>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No connectors match your filters.
              </p>
            )
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/80">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Connector
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((connector) => {
                    const connection = connectionById.get(connector.id);
                    const canConnect = Boolean(connector.canConnect && adapter?.connectConnector);
                    const rowError = rowErrors[connector.id];
                    return (
                      <tr
                        key={connector.id}
                        onClick={() => setDetailId(connector.id)}
                        className="cursor-pointer transition-colors hover:bg-muted/40"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ConnectorLogo
                              connectorId={connector.id}
                              fallbackGradient={connector.iconBg}
                              fallbackText={connector.iconText}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailId(connector.id);
                                }}
                                className="block max-w-full truncate text-sm font-medium text-foreground hover:underline"
                              >
                                {connector.name}
                              </button>
                              {rowError && (
                                <p className="mt-0.5 text-[11px] text-red-500">{rowError}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {connector.category}
                        </td>
                        <td className="px-3 py-2.5">
                          <ConnectorStatusCell
                            connector={connector}
                            connection={connection}
                            canConnect={canConnect}
                            mutating={mutatingIds.has(connector.id)}
                            onConnect={() => handleConnect(connector.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillsPanel — table view (columns Skill | Author) + Browse into the shared
// directory. HONEST OMISSIONS (spec allows skipping where data/backing does
// not exist):
//   - No "Add" dropdown: @agiworkforce/skills is a read-only loader and
//     /api/skills is GET-only — there is no create-with-AI, manual-authoring,
//     or upload capability to wire, so no Add items render.
//   - No "Last updated" column: the skill loader exposes no timestamps.
//   - No download counts / popularity numbers anywhere (no real metrics).
// ---------------------------------------------------------------------------

function SkillsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'browse'>('table');
  const skills = useMemo(() => adapter?.skills ?? [], [adapter?.skills]);
  const loading = adapter?.skillsLoading ?? false;
  const loadError = adapter?.skillsError;

  const filtered = useMemo(() => {
    if (!search) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.source.includes(q),
    );
  }, [skills, search]);

  if (view === 'browse') {
    return (
      <DirectoryBrowse adapter={adapter} initialTab="skills" onBack={() => setView('table')} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Skills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quick-access prompts and specialist AI agents for every domain.
        </p>
      </div>

      {/* Toolbar: search + Browse */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => setView('browse')}
          className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Browse
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-500">{loadError}</p>
          {adapter?.retrySkills ? (
            <button
              type="button"
              className="mt-3 text-xs font-medium text-foreground underline underline-offset-2"
              onClick={() => void adapter.retrySkills?.()}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {skills.length === 0
            ? 'No skills loaded in this environment.'
            : 'No skills match your search.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/80">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Skill
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Author
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((skill: SettingsSkill) => (
                <tr key={skill.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{skill.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {skill.description || skill.source}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {skillAuthorLabel(skill.source)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PluginsPanel — table view (columns Plugin | Author | Skills | Last updated,
// optional columns rendering only when at least one plugin supplies real
// data) + Browse into the shared directory. The Add dropdown renders ONLY the
// items whose adapter capability exists (onAddPluginMarketplace /
// onUploadPlugin); with neither, the dropdown is omitted entirely. There is
// deliberately NO "Create with AGI" item anywhere yet — no real
// plugin-creation flow exists to back it.
// ---------------------------------------------------------------------------

function PluginsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'browse'>('table');
  const plugins = useMemo(() => adapter?.plugins ?? [], [adapter?.plugins]);
  const loading = adapter?.pluginsLoading ?? false;

  const filtered = useMemo(() => {
    if (!search) return plugins;
    const q = search.toLowerCase();
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.author ?? '').toLowerCase().includes(q),
    );
  }, [plugins, search]);

  // Optional columns render only when real data exists somewhere in the list.
  const hasAuthor = plugins.some((p) => p.author);
  const hasSkillCount = plugins.some((p) => p.skillCount != null);
  const hasUpdatedAt = plugins.some((p) => p.updatedAt);

  const addItems: { label: string; onSelect: () => void }[] = [
    ...(adapter?.onAddPluginMarketplace
      ? [{ label: 'Add marketplace', onSelect: adapter.onAddPluginMarketplace }]
      : []),
    ...(adapter?.onUploadPlugin
      ? [{ label: 'Upload plugin', onSelect: adapter.onUploadPlugin }]
      : []),
  ];

  if (view === 'browse') {
    return (
      <DirectoryBrowse adapter={adapter} initialTab="plugins" onBack={() => setView('table')} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Plugins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Extend AGI with third-party plugins and community integrations.
        </p>
      </div>

      {/* Toolbar: search + Browse + Add (capability-gated) */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => setView('browse')}
          className="h-8 shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Browse
        </button>
        {addItems.length > 0 && (
          <Menu
            align="end"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Add
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            menuClassName="w-48"
          >
            {({ close }) => (
              <>
                {addItems.map((item) => (
                  <MenuItem key={item.label} close={close} onSelect={item.onSelect}>
                    {item.label}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Puzzle className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">
            {plugins.length === 0
              ? 'No plugins installed. Plugins are available via the AGI CLI.'
              : 'No plugins match your search.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/80">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Plugin
                </th>
                {hasAuthor && (
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Author
                  </th>
                )}
                {hasSkillCount && (
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Skills
                  </th>
                )}
                {hasUpdatedAt && (
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Last updated
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((plugin) => (
                <tr key={plugin.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {plugin.name}
                        </p>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            plugin.enabled
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {plugin.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {plugin.description || 'No description.'}
                      </p>
                    </div>
                  </td>
                  {hasAuthor && (
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {plugin.author ?? '-'}
                    </td>
                  )}
                  {hasSkillCount && (
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {plugin.skillCount ?? '-'}
                    </td>
                  )}
                  {hasUpdatedAt && (
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {plugin.updatedAt ? new Date(plugin.updatedAt).toLocaleDateString() : '-'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsModal props + component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// NavButton — a single nav row (filled pill when active), shared by the grouped
// and legacy flat renderers.
// ---------------------------------------------------------------------------

function NavButton({
  itemKey,
  label,
  Icon,
  isActive,
  onClick,
}: {
  itemKey: string;
  label: string;
  Icon: LucideIcon;
  isActive: boolean;
  onClick: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(itemKey)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'opacity-90' : 'opacity-60')} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  activeSection: string;
  onSectionChange: (key: string) => void;
  /**
   * Map of section key to rendered React node for the right pane.
   * Connectors/Skills/Plugins fall back to built-in adapter-driven panels.
   */
  sectionContent: Partial<Record<string, React.ReactNode>>;
  /** Subset of nav keys to show (omit to show all). Ignored when navGroups is set. */
  activeKeys?: string[];
  /**
   * Grouped nav to render (group headings + icon'd items). When provided, this
   * replaces the flat built-in list — the single source is
   * `SETTINGS_NAV_GROUPS_WEB` from `../settings-nav`. Omit for the legacy flat
   * list.
   */
  navGroups?: SettingsNavGroupResolved[];
  /** Data for built-in Connectors/Skills/Plugins panels. */
  adapter?: SettingsDataAdapter;
  /** Modal title (default: "Settings") */
  title?: string;
}

export function SettingsModal({
  open,
  onClose,
  activeSection,
  onSectionChange,
  sectionContent,
  activeKeys,
  navGroups,
  adapter,
  title = 'Settings',
}: SettingsModalProps) {
  const [navSearch, setNavSearch] = useState('');

  // Grouped nav (preferred): filter items within each group, dropping groups
  // that end up empty so headers never orphan.
  const visibleGroups = useMemo(() => {
    if (!navGroups) return null;
    const filter = navSearch.trim().toLowerCase();
    return navGroups
      .map((g) => ({
        label: g.label,
        items: filter ? g.items.filter((i) => matchesNavFilter(i, filter)) : g.items,
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, navSearch]);

  // Legacy flat nav (backward compat when navGroups is not provided).
  const visibleEntries = useMemo(() => {
    const filter = navSearch.trim().toLowerCase();
    const keySet = activeKeys ? new Set(activeKeys) : null;
    return ALL_NAV_ENTRIES.filter((e) => {
      if (keySet && !keySet.has(e.key)) return false;
      if (filter) return matchesNavFilter(e, filter);
      return true;
    });
  }, [navSearch, activeKeys]);

  // Escape to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  function renderSection() {
    if (activeSection === 'connectors') {
      return sectionContent['connectors'] ?? <ConnectorsPanel adapter={adapter} />;
    }
    if (activeSection === 'skills') {
      return sectionContent['skills'] ?? <SkillsPanel adapter={adapter} />;
    }
    if (activeSection === 'plugins') {
      return sectionContent['plugins'] ?? <PluginsPanel adapter={adapter} />;
    }
    return (
      sectionContent[activeSection] ?? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No content for section &quot;{activeSection}&quot;.
          </p>
        </div>
      )
    );
  }

  return (
    /* Backdrop — clicking outside does NOT close (matches Claude reference) */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Dialog */}
      <div
        className="relative flex overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl"
        style={{ width: 'min(92vw, 860px)', height: 'min(90vh, 680px)' }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Left nav */}
        <nav
          aria-label="Settings navigation"
          className="flex shrink-0 flex-col overflow-y-auto border-r border-border/60"
          style={{ width: 220, padding: '20px 0' }}
        >
          {/* Title */}
          <div className="mb-3 px-4 text-[15px] font-semibold text-foreground">{title}</div>

          {/* Search */}
          <div className="relative mb-3 px-3">
            <Search className="absolute left-6 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              className="h-7 w-full rounded-md border border-border/60 bg-muted/30 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          {/* Nav entries */}
          {visibleGroups ? (
            <div className="flex flex-col gap-3 px-2">
              {visibleGroups.map((group, gi) => (
                <div key={group.label ?? `group-${gi}`} className="flex flex-col gap-0.5">
                  {group.label && (
                    <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group.label}
                    </div>
                  )}
                  {group.items.map((item) => (
                    <NavButton
                      key={item.key}
                      itemKey={item.key}
                      label={item.label}
                      Icon={item.icon}
                      isActive={activeSection === item.key}
                      onClick={onSectionChange}
                    />
                  ))}
                </div>
              ))}
              {visibleGroups.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 px-2">
              {visibleEntries.map((entry) => (
                <NavButton
                  key={entry.key}
                  itemKey={entry.key}
                  label={entry.label}
                  Icon={entry.icon}
                  isActive={activeSection === entry.key}
                  onClick={onSectionChange}
                />
              ))}
            </div>
          )}
        </nav>

        {/* Right pane */}
        <main
          className="min-w-0 flex-1 overflow-y-auto"
          style={{ padding: '28px 32px 32px' }}
          id="settings-pane"
        >
          {/* Bound the measure: without it the same pane renders 576px wide in
              the Cloud shell and 720px in the Local one, and grows unbounded
              with the window. */}
          <div className="mx-auto w-full max-w-[672px]">{renderSection()}</div>
        </main>
      </div>
    </div>
  );
}
