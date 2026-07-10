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
  Plus,
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
  SlidersHorizontal,
  ArrowUpDown,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../cn';
import type { SettingsDataAdapter, SettingsConnector, SettingsSkill } from './types';
import type { SettingsNavGroupResolved } from '../settings-nav';
import { ConnectorLogo } from './ConnectorLogo';

// ---------------------------------------------------------------------------
// Nav config — flat list, no group headers (matches Claude reference)
// ---------------------------------------------------------------------------

interface NavEntry {
  key: string;
  label: string;
  icon: LucideIcon;
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
// ConnectorCard — 2-column grid card matching reference 252
// ---------------------------------------------------------------------------

function ConnectorCard({
  connector,
  connected,
  mutating,
  onConnect,
  onDisconnect,
}: {
  connector: SettingsConnector;
  connected: boolean;
  mutating: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isReady = connector.phase <= 1 && connector.authType !== 'oauth';
  // NOTE: this is the connector's action count, not a popularity ranking —
  // do not relabel as "#N popular". We have no real usage data to back a
  // popularity claim, so showing one would be a fabricated badge.
  const actionCountLabel =
    connector.actionCount > 0
      ? `${connector.actionCount} action${connector.actionCount === 1 ? '' : 's'}`
      : null;

  return (
    <div className="group flex min-h-[108px] flex-col gap-2 rounded-lg border border-border/80 bg-card/40 p-3.5 transition-colors hover:bg-card/70">
      {/* Top row: logo + name + connect button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <ConnectorLogo
            connectorId={connector.id}
            fallbackGradient={connector.iconBg}
            fallbackText={connector.iconText}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-foreground truncate">{connector.name}</span>
              {connected && (
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                  <Check className="h-2 w-2 text-emerald-500" />
                </span>
              )}
            </div>
            {actionCountLabel && (
              <span className="text-[11px] text-muted-foreground">{actionCountLabel}</span>
            )}
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0">
          {connected ? (
            <button
              type="button"
              onClick={onDisconnect}
              disabled={mutating}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {mutating ? '...' : 'Disconnect'}
            </button>
          ) : connector.phase > 1 ? (
            <span className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground">
              Soon
            </span>
          ) : !isReady ? (
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <Lock className="h-3 w-3" />
              Connect
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={mutating}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label={`Connect ${connector.name}`}
            >
              {mutating ? <span className="text-xs">...</span> : <Plus className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
        {connector.description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConnectorsPanel
// ---------------------------------------------------------------------------

const PARTNER_CHIP_LABEL = 'Anthropic & Partners';

function ConnectorsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());

  const connectors = useMemo(() => adapter?.connectors ?? [], [adapter?.connectors]);
  const connected = useMemo(
    () => new Set((adapter?.connectedConnectors ?? []).map((c) => c.connectorId)),
    [adapter?.connectedConnectors],
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(connectors.map((c) => c.category)))],
    [connectors],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return connectors.filter((c) => {
      if (c.exclusive) return false;
      if (activeCategory !== 'All' && c.category !== activeCategory) return false;
      if (q) return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
      return true;
    });
  }, [connectors, search, activeCategory]);

  const handleConnect = useCallback(
    async (id: string) => {
      setMutatingIds((prev) => new Set([...prev, id]));
      try {
        await adapter?.connectConnector?.(id);
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [adapter],
  );

  const handleDisconnect = useCallback(
    async (id: string) => {
      setMutatingIds((prev) => new Set([...prev, id]));
      try {
        await adapter?.disconnectConnector?.(id);
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [adapter],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Connectors</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your tools and give the assistant access to your apps.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search connectors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Anthropic & Partners chip + Filter/Sort */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* "Anthropic & Partners" primary chip */}
          <button
            type="button"
            onClick={() => setActiveCategory('All')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              activeCategory === 'All'
                ? 'bg-foreground text-background'
                : 'border border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {PARTNER_CHIP_LABEL}
          </button>

          {/* Category chips (skip 'All' since partner chip covers it) */}
          {categories.slice(1).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-foreground text-background'
                  : 'border border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Filter / Sort buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <SlidersHorizontal className="h-3 w-3" />
            Filter by
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowUpDown className="h-3 w-3" />
            Sort by
          </button>
        </div>
      </div>

      {/* Available to your team label */}
      {filtered.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground">Available to your team</p>
      )}

      {/* 2-column card grid */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No connectors match your search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              connected={connected.has(connector.id)}
              mutating={mutatingIds.has(connector.id)}
              onConnect={() => void handleConnect(connector.id)}
              onDisconnect={() => void handleDisconnect(connector.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillsPanel
// ---------------------------------------------------------------------------

function SkillsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const skills = useMemo(() => adapter?.skills ?? [], [adapter?.skills]);
  const loading = adapter?.skillsLoading ?? false;

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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Skills</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quick-access prompts and specialist AI agents for every domain.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {skills.length === 0
            ? 'No skills loaded in this environment.'
            : 'No skills match your search.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((skill: SettingsSkill) => (
            <div
              key={skill.id}
              className="flex items-center gap-3 rounded-lg border border-border/80 bg-card/40 p-3.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{skill.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {skill.description || skill.source}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PluginsPanel
// ---------------------------------------------------------------------------

function PluginsPanel({ adapter }: { adapter?: SettingsDataAdapter }) {
  const [search, setSearch] = useState('');
  const plugins = useMemo(() => adapter?.plugins ?? [], [adapter?.plugins]);
  const loading = adapter?.pluginsLoading ?? false;

  const filtered = useMemo(() => {
    if (!search) return plugins;
    const q = search.toLowerCase();
    return plugins.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [plugins, search]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Plugins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Extend AGI with third-party plugins and community integrations.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search plugins..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
        />
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
        <div className="flex flex-col gap-2">
          {filtered.map((plugin) => (
            <div
              key={plugin.id}
              className="flex items-center gap-3 rounded-lg border border-border/80 bg-card/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{plugin.name}</p>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      plugin.enabled
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {plugin.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {plugin.description || 'No description.'}
                </p>
              </div>
            </div>
          ))}
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
          ? 'bg-foreground text-background font-medium'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'opacity-100' : 'opacity-60')} />
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
        items: filter ? g.items.filter((i) => i.label.toLowerCase().includes(filter)) : g.items,
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, navSearch]);

  // Legacy flat nav (backward compat when navGroups is not provided).
  const visibleEntries = useMemo(() => {
    const filter = navSearch.trim().toLowerCase();
    const keySet = activeKeys ? new Set(activeKeys) : null;
    return ALL_NAV_ENTRIES.filter((e) => {
      if (keySet && !keySet.has(e.key)) return false;
      if (filter) return e.label.toLowerCase().includes(filter);
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
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
