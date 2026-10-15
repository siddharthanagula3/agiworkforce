import {
  AlertCircle,
  Bot,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Command,
  Loader2,
  Package,
  Puzzle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { homeDir as getHomeDir } from '@tauri-apps/api/path';
import { useConfirmAction, useUiTranslation } from '@agiworkforce/ui';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { invoke, isTauriContext } from '../../lib/tauri-mock';
import { useSettingsStore } from '../../stores/settingsStore';
import { selectCurrentFolder, useProjectStore } from '../../stores/projectStore';
import { Button } from '@/ui/Button';
import { Switch } from '@/ui/Switch';

interface InstalledPluginRecord {
  scope: 'user' | 'local';
  installPath: string;
  version: string;
  installedAt: string;
  projectPath?: string;
}

interface PluginManifest {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  skills?: Array<{ name: string; description?: string }>;
  agents?: Array<{ name: string; description?: string }>;
}

interface ResolvedPlugin {
  id: string;
  marketplaceId: string;
  displayName: string;
  description: string;
  version: string;
  scope: 'user' | 'local';
  installPath: string;
  skills: string[];
  agents: string[];
  installedAt: string;
  enabled: boolean;
}

interface ProjectEntry {
  name: string;
  path: string;
}

interface DirEntry {
  name: string;
  path: string;
  is_file: boolean;
  is_dir: boolean;
}

function pluginIdFromKey(key: string): { name: string; marketplace: string } {
  const parts = key.split('@');
  return { name: parts[0] ?? key, marketplace: parts[1] ?? '' };
}

function humanizeId(id: string): string {
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeProjectPath(path: string | undefined): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

function normalizePluginSpec(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^[A-Za-z0-9._:@/-]+$/.test(trimmed)) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

type JsonObjectRead = { ok: true; value: Record<string, unknown> } | { ok: false };

async function readJsonObject(path: string): Promise<JsonObjectRead> {
  let raw: string;
  try {
    raw = await invoke<string>('file_read', { path });
  } catch {
    return { ok: true, value: {} };
  }

  if (raw.trim() === '') return { ok: true, value: {} };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

function readEnabledPlugins(settings: Record<string, unknown>): Record<string, boolean> {
  const raw = settings['enabledPlugins'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean') result[key] = value;
  }
  return result;
}

// Lowest to highest precedence, matching how the plugin host resolves settings.
function claudeSettingsPaths(homeDirPath: string | null, projectRoot: string | null): string[] {
  const paths: string[] = [];
  if (homeDirPath) paths.push(`${homeDirPath}/.claude/settings.json`);
  if (projectRoot) {
    paths.push(`${projectRoot}/.claude/settings.json`);
    paths.push(`${projectRoot}/.claude/settings.local.json`);
  }
  return paths;
}

async function tryDirList(path: string): Promise<DirEntry[]> {
  try {
    return await invoke<DirEntry[]>('dir_list', { path });
  } catch {
    return [];
  }
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  expanded,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center justify-between w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      </div>
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}

function PluginRow({
  plugin,
  actionInProgress,
  pluginCliAvailable,
  onUpdate,
  onRemove,
  onToggleEnabled,
}: {
  plugin: ResolvedPlugin;
  actionInProgress: string | null;
  pluginCliAvailable: boolean;
  onUpdate: (plugin: ResolvedPlugin) => void;
  onRemove: (plugin: ResolvedPlugin) => void;
  onToggleEnabled: (plugin: ResolvedPlugin, enabled: boolean) => void;
}) {
  const { plural } = useUiTranslation('common');
  const [expanded, setExpanded] = useState(false);
  const updateKey = `update:${plugin.id}`;
  const removeKey = `remove:${plugin.id}`;
  const toggleKey = `toggle:${plugin.id}`;
  const isUpdating = actionInProgress === updateKey;
  const isRemoving = actionInProgress === removeKey;
  const isToggling = actionInProgress === toggleKey;
  const scopeBadge =
    plugin.scope === 'local' ? (
      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        project
      </span>
    ) : (
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">user</span>
    );

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex items-start gap-3 w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{plugin.displayName}</span>
            {scopeBadge}
            {!plugin.enabled && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                disabled
              </span>
            )}
            {plugin.skills.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {plural('counts.skills', plugin.skills.length, {
                  one: '{{count}} skill',
                  other: '{{count}} skills',
                })}
              </span>
            )}
            {plugin.agents.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {plural('counts.agents', plugin.agents.length, {
                  one: '{{count}} agent',
                  other: '{{count}} agents',
                })}
              </span>
            )}
          </div>
          {plugin.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{plugin.description}</p>
          )}
        </div>
        <div className="shrink-0 text-xs text-muted-foreground mt-0.5">v{plugin.version}</div>
        <div className="shrink-0 mt-0.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-11 pb-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">Enabled</p>
              <p className="text-xs text-muted-foreground">
                Disabled plugins stay installed but their skills, agents, and commands are not
                loaded.
              </p>
            </div>
            <Switch
              checked={plugin.enabled}
              disabled={isToggling || isRemoving}
              onCheckedChange={(next) => onToggleEnabled(plugin, next)}
              aria-label={`Enable ${plugin.displayName}`}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              disabled={!pluginCliAvailable || isUpdating || isRemoving}
              onClick={() => onUpdate(plugin)}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Updating…
                </>
              ) : (
                'Update'
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!pluginCliAvailable || isUpdating || isRemoving}
              className="text-danger-text hover:text-danger-text"
              onClick={() => onRemove(plugin)}
            >
              {isRemoving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Removing…
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </div>

          {(plugin.skills.length > 0 || plugin.agents.length > 0) && (
            <>
              {plugin.skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {plugin.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {plugin.agents.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Agents</p>
                  <div className="flex flex-wrap gap-1">
                    {plugin.agents.map((a) => (
                      <span
                        key={a}
                        className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  icon: Icon,
  prefix,
}: {
  entry: ProjectEntry;
  icon: React.ComponentType<{ className?: string }>;
  prefix?: string;
}) {
  const displayName = entry.name.replace(/\.(md|mdc|yaml|yml)$/, '');
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">
          {prefix && <span className="text-muted-foreground font-normal">{prefix}</span>}
          {displayName}
        </span>
      </div>
      <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
        {entry.path.split('/').slice(-3).join('/')}
      </span>
    </div>
  );
}

export function SkillsPluginsSettings() {
  const allowedDirectories = useSettingsStore((s) => s.allowedDirectories);
  const currentProjectFolder = useProjectStore(selectCurrentFolder);

  const [plugins, setPlugins] = useState<ResolvedPlugin[]>([]);
  const [commands, setCommands] = useState<ProjectEntry[]>([]);
  const [skills, setSkills] = useState<ProjectEntry[]>([]);
  const [agents, setAgents] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pluginInput, setPluginInput] = useState('');
  const [pluginCliAvailable, setPluginCliAvailable] = useState<boolean | null>(null);
  const [pluginActionInProgress, setPluginActionInProgress] = useState<string | null>(null);
  const [pluginActionMessage, setPluginActionMessage] = useState<string | null>(null);
  const [homeDirPath, setHomeDirPath] = useState<string | null>(null);

  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const [pluginsExpanded, setPluginsExpanded] = useState(true);
  const [commandsExpanded, setCommandsExpanded] = useState(true);
  const [skillsExpanded, setSkillsExpanded] = useState(true);
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  const isNonTauri = !isTauriContext();
  const projectRoot = currentProjectFolder ?? allowedDirectories[0] ?? null;

  const load = useCallback(async () => {
    if (isNonTauri) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let homeDirPath: string | null = null;
      try {
        homeDirPath = await getHomeDir();
      } catch {
        console.warn('[SkillsPluginsSettings] Could not determine home directory');
      }
      setHomeDirPath(homeDirPath);

      const enabledPlugins: Record<string, boolean> = {};
      for (const settingsPath of claudeSettingsPaths(homeDirPath, projectRoot)) {
        const read = await readJsonObject(settingsPath);
        if (read.ok) Object.assign(enabledPlugins, readEnabledPlugins(read.value));
      }

      const resolvedPlugins: ResolvedPlugin[] = [];
      if (homeDirPath) {
        try {
          const raw = await invoke<string>('file_read', {
            path: `${homeDirPath}/.claude/plugins/installed_plugins.json`,
          });
          const data = JSON.parse(raw) as {
            version: number;
            plugins: Record<string, InstalledPluginRecord[]>;
          };

          const entries = Object.entries(data.plugins ?? {});
          const normalizedProjectRoot = normalizeProjectPath(projectRoot ?? undefined);
          const resolved = await Promise.all(
            entries.map(async ([key, records]) => {
              const scopedRecords = records.filter((record) => {
                if (record.scope !== 'local') return true;
                if (!normalizedProjectRoot) return false;
                return normalizeProjectPath(record.projectPath) === normalizedProjectRoot;
              });

              const { name, marketplace } = pluginIdFromKey(key);
              const latestRecord = [...scopedRecords].sort(
                (a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime(),
              )[0];
              if (!latestRecord) return null;

              let manifest: PluginManifest | null = null;
              try {
                const manifestRaw = await invoke<string>('file_read', {
                  path: `${latestRecord.installPath}/plugin.json`,
                });
                manifest = JSON.parse(manifestRaw) as PluginManifest;
              } catch {
                // no manifest, use defaults
              }

              return {
                id: key,
                marketplaceId: marketplace,
                displayName: manifest?.name ?? humanizeId(name),
                description: manifest?.description ?? '',
                version: manifest?.version ?? latestRecord.version,
                scope: latestRecord.scope,
                installPath: latestRecord.installPath,
                skills: manifest?.skills?.map((s) => s.name) ?? [],
                agents: manifest?.agents?.map((a) => a.name) ?? [],
                installedAt: latestRecord.installedAt,
                enabled: enabledPlugins[key] !== false,
              };
            }),
          );
          resolvedPlugins.push(...(resolved.filter(Boolean) as ResolvedPlugin[]));

          resolvedPlugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
        } catch {
          // plugin registry not available
        }
      }
      setPlugins(resolvedPlugins);

      if (projectRoot) {
        const claudeDir = `${projectRoot}/.claude`;

        const commandEntries = await tryDirList(`${claudeDir}/commands`);
        setCommands(
          commandEntries
            .filter((e) => e.is_file)
            .map((e) => ({ name: e.name, path: e.path }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );

        const skillDirs = await tryDirList(`${claudeDir}/skills`);
        const skillEntries: ProjectEntry[] = [];
        for (const dir of skillDirs.filter((e) => e.is_dir)) {
          skillEntries.push({ name: dir.name, path: dir.path });
        }
        for (const file of skillDirs.filter((e) => e.is_file)) {
          skillEntries.push({ name: file.name, path: file.path });
        }
        setSkills(skillEntries.sort((a, b) => a.name.localeCompare(b.name)));

        const agentEntries = await tryDirList(`${claudeDir}/agents`);
        setAgents(
          agentEntries
            .filter((e) => e.is_file)
            .map((e) => ({ name: e.name, path: e.path }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } else {
        setCommands([]);
        setSkills([]);
        setAgents([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }, [isNonTauri, projectRoot]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isNonTauri) {
      setPluginCliAvailable(false);
      return;
    }

    let mounted = true;
    setPluginCliAvailable(null);
    void invoke<boolean>('claude_plugin_cli_available')
      .then((available) => {
        if (mounted) setPluginCliAvailable(available === true);
      })
      .catch(() => {
        if (mounted) setPluginCliAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, [isNonTauri]);

  const runPluginCliAction = useCallback(
    async (action: 'install' | 'update' | 'remove', pluginSpec: string) => {
      const normalizedSpec = normalizePluginSpec(pluginSpec);
      if (!normalizedSpec) {
        setPluginActionMessage(
          `Invalid plugin identifier "${pluginSpec}". Use letters, numbers, ., _, -, :, @, and /.`,
        );
        return;
      }
      if (pluginCliAvailable !== true) {
        setPluginActionMessage(
          'The claude command is not available, so Claude Code plugins cannot be changed from here.',
        );
        return;
      }

      const actionKey = `${action}:${normalizedSpec}`;
      setPluginActionInProgress(actionKey);
      setPluginActionMessage(null);

      try {
        await invoke('claude_plugin_change', { action, plugin: normalizedSpec });
        setPluginActionMessage(`Plugin ${action} succeeded: ${normalizedSpec}`);
        if (action === 'install') {
          setPluginInput('');
        }
        await load();
      } catch (error) {
        setPluginActionMessage(getSimpleErrorMessage(error));
      } finally {
        setPluginActionInProgress(null);
      }
    },
    [load, pluginCliAvailable],
  );

  const handleInstallPlugin = useCallback(async () => {
    await runPluginCliAction('install', pluginInput);
  }, [pluginInput, runPluginCliAction]);

  const handleUpdatePlugin = useCallback(
    (plugin: ResolvedPlugin) => {
      void runPluginCliAction('update', plugin.id);
    },
    [runPluginCliAction],
  );

  const handleRemovePlugin = useCallback(
    (plugin: ResolvedPlugin) => {
      confirm({
        title: `Remove "${plugin.displayName}" from Claude Code?`,
        description:
          'This runs the claude command to uninstall the plugin. Claude Code loses its skills, agents and tools, and to use the plugin again you have to install it again.',
        confirmLabel: 'Remove plugin',
        destructive: true,
        onConfirm: () => runPluginCliAction('remove', plugin.id),
      });
    },
    [confirm, runPluginCliAction],
  );

  const handleTogglePluginEnabled = useCallback(
    (plugin: ResolvedPlugin, enabled: boolean) => {
      void (async () => {
        const candidatePaths = claudeSettingsPaths(homeDirPath, projectRoot);
        const scopeDefault =
          plugin.scope === 'local' && projectRoot
            ? `${projectRoot}/.claude/settings.json`
            : homeDirPath && `${homeDirPath}/.claude/settings.json`;

        if (!scopeDefault) {
          setPluginActionMessage(
            `Could not locate a settings file to record the state of "${plugin.displayName}".`,
          );
          return;
        }

        setPluginActionInProgress(`toggle:${plugin.id}`);
        setPluginActionMessage(null);

        try {
          const reads = await Promise.all(
            candidatePaths.map(async (path) => ({ path, read: await readJsonObject(path) })),
          );

          const unreadable = reads.find((entry) => !entry.read.ok);
          if (unreadable) {
            setPluginActionMessage(
              `Could not parse ${unreadable.path}. Fix that file before changing plugin state.`,
            );
            return;
          }

          // The highest-precedence file that already names this plugin wins at load
          // time, so writing anywhere lower would be silently overridden.
          const declaring = [...reads]
            .reverse()
            .find(
              (entry) =>
                entry.read.ok && Object.hasOwn(readEnabledPlugins(entry.read.value), plugin.id),
            );
          const targetPath = declaring?.path ?? scopeDefault;
          const target = reads.find((entry) => entry.path === targetPath);
          const settings = target?.read.ok ? target.read.value : {};

          const nextSettings = {
            ...settings,
            enabledPlugins: { ...readEnabledPlugins(settings), [plugin.id]: enabled },
          };

          await invoke('file_write', {
            path: targetPath,
            content: `${JSON.stringify(nextSettings, null, 2)}\n`,
          });

          setPlugins((current) =>
            current.map((entry) => (entry.id === plugin.id ? { ...entry, enabled } : entry)),
          );
          setPluginActionMessage(
            `${plugin.displayName} ${enabled ? 'enabled' : 'disabled'} in ${targetPath}. Restart running Claude Code sessions to pick it up.`,
          );
        } catch (err) {
          setPluginActionMessage(
            err instanceof Error ? err.message : 'Failed to change plugin state',
          );
        } finally {
          setPluginActionInProgress(null);
        }
      })();
    },
    [homeDirPath, projectRoot],
  );

  const totalProjectItems = commands.length + skills.length + agents.length;
  const pluginCliStatus =
    pluginCliAvailable === null
      ? 'Checking for the claude command...'
      : pluginCliAvailable
        ? 'claude command found'
        : 'claude command not found';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-h3 mb-1">Claude Code plugins</h3>
          <p className="text-sm text-muted-foreground">
            These are the plugins Claude Code keeps on this machine in ~/.claude/plugins. AGI
            Workforce chat does not load them: nothing here adds a skill, agent or tool to a chat in
            this app.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="Refresh"
          onClick={() => void load()}
          disabled={loading || isNonTauri}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Install, update and remove</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                pluginCliAvailable
                  ? 'bg-success-fill/10 text-success-text'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {pluginCliStatus}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            These actions run the claude command for you. They change Claude Code, not this app.
            Installing or updating a plugin is confirmed in a system dialog first.
          </p>
        </div>
        {pluginCliAvailable === false && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            These actions are off because the claude command is not installed or not on your PATH.
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={pluginInput}
            onChange={(event) => setPluginInput(event.target.value)}
            placeholder="plugin-name@marketplace"
            disabled={isNonTauri || pluginCliAvailable !== true || pluginActionInProgress !== null}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button
            size="sm"
            disabled={
              isNonTauri ||
              pluginCliAvailable !== true ||
              pluginActionInProgress !== null ||
              !pluginInput.trim()
            }
            onClick={() => void handleInstallPlugin()}
          >
            {pluginActionInProgress?.startsWith('install:') ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                Installing…
              </>
            ) : (
              'Install plugin'
            )}
          </Button>
        </div>
        {pluginActionMessage && (
          <p className="text-xs text-muted-foreground break-words">{pluginActionMessage}</p>
        )}
      </div>

      {isNonTauri && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Reading Claude Code plugins requires the desktop app.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading plugins...
        </div>
      )}

      {!loading && !isNonTauri && (
        <>
          {/* Installed Plugins */}
          <div className="rounded-lg border border-border overflow-hidden">
            <SectionHeader
              icon={Puzzle}
              title="Installed in Claude Code"
              count={plugins.length}
              expanded={pluginsExpanded}
              onToggle={() => setPluginsExpanded((v) => !v)}
            />
            {pluginsExpanded && (
              <div className="divide-y divide-border">
                {plugins.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Claude Code has no plugins installed on this machine.
                  </p>
                ) : (
                  plugins.map((p) => (
                    <PluginRow
                      key={p.id}
                      plugin={p}
                      actionInProgress={pluginActionInProgress}
                      pluginCliAvailable={pluginCliAvailable === true}
                      onUpdate={handleUpdatePlugin}
                      onRemove={handleRemovePlugin}
                      onToggleEnabled={handleTogglePluginEnabled}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Project Resources */}
          {totalProjectItems > 0 || Boolean(projectRoot) ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Claude Code files in this project</h4>
                <p className="text-sm text-muted-foreground">
                  Listed for reference from{' '}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {projectRoot ? `${projectRoot}/.claude` : '.claude'}
                  </code>
                  . AGI Workforce chat does not run these commands or load these skills.
                </p>
              </div>

              {/* Slash Commands */}
              <div className="rounded-lg border border-border overflow-hidden">
                <SectionHeader
                  icon={Command}
                  title="Slash Commands"
                  count={commands.length}
                  expanded={commandsExpanded}
                  onToggle={() => setCommandsExpanded((v) => !v)}
                />
                {commandsExpanded && (
                  <div>
                    {commands.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        No slash commands found in the project .claude folder.
                      </p>
                    ) : (
                      commands.map((c) => <EntryRow key={c.path} entry={c} icon={Zap} prefix="/" />)
                    )}
                  </div>
                )}
              </div>

              {/* Project Skills */}
              <div className="rounded-lg border border-border overflow-hidden">
                <SectionHeader
                  icon={BookOpen}
                  title="Project Skills"
                  count={skills.length}
                  expanded={skillsExpanded}
                  onToggle={() => setSkillsExpanded((v) => !v)}
                />
                {skillsExpanded && (
                  <div>
                    {skills.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        No skills found in the project .claude folder.
                      </p>
                    ) : (
                      skills.map((s) => <EntryRow key={s.path} entry={s} icon={BookOpen} />)
                    )}
                  </div>
                )}
              </div>

              {/* Project Agents */}
              <div className="rounded-lg border border-border overflow-hidden">
                <SectionHeader
                  icon={Bot}
                  title="Project Agents"
                  count={agents.length}
                  expanded={agentsExpanded}
                  onToggle={() => setAgentsExpanded((v) => !v)}
                />
                {agentsExpanded && (
                  <div>
                    {agents.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        No agents found in the project .claude folder.
                      </p>
                    ) : (
                      agents.map((a) => <EntryRow key={a.path} entry={a} icon={Bot} />)
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
      {confirmDialog}
    </div>
  );
}

export default SkillsPluginsSettings;
