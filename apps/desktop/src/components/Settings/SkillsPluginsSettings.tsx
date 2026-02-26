/**
 * SkillsPluginsSettings
 *
 * Shows installed Claude plugins (user-level) and project-scoped resources:
 * - Installed plugins from ~/.claude/plugins/installed_plugins.json
 * - Project skills from .claude/skills/
 * - Project agents from .claude/agents/
 * - Project slash commands from .claude/commands/
 */

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
import { invoke, isTauriContext } from '../../lib/tauri-mock';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function tryDirList(path: string): Promise<DirEntry[]> {
  try {
    return await invoke<DirEntry[]>('dir_list', { path });
  } catch {
    return [];
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
      className="flex items-center justify-between w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
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

function PluginRow({ plugin }: { plugin: ResolvedPlugin }) {
  const [expanded, setExpanded] = useState(false);
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
        className="flex items-start gap-3 w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{plugin.displayName}</span>
            {scopeBadge}
            {plugin.skills.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {plugin.skills.length} skill{plugin.skills.length !== 1 ? 's' : ''}
              </span>
            )}
            {plugin.agents.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {plugin.agents.length} agent{plugin.agents.length !== 1 ? 's' : ''}
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

      {expanded && (plugin.skills.length > 0 || plugin.agents.length > 0) && (
        <div className="px-11 pb-3 space-y-2">
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
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
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

// ── Main Component ────────────────────────────────────────────────────────────

export function SkillsPluginsSettings() {
  const allowedDirectories = useSettingsStore((s) => s.allowedDirectories);

  const [plugins, setPlugins] = useState<ResolvedPlugin[]>([]);
  const [commands, setCommands] = useState<ProjectEntry[]>([]);
  const [skills, setSkills] = useState<ProjectEntry[]>([]);
  const [agents, setAgents] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pluginsExpanded, setPluginsExpanded] = useState(true);
  const [commandsExpanded, setCommandsExpanded] = useState(true);
  const [skillsExpanded, setSkillsExpanded] = useState(true);
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  const isNonTauri = !isTauriContext();
  // Use the string primitive (not the array reference) as the dependency so
  // useCallback doesn't re-create load on every render when the selector
  // returns a new array instance with the same value.
  const projectRoot = allowedDirectories[0];

  const load = useCallback(async () => {
    if (isNonTauri) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Get home directory — skip user-level plugins if unavailable
      let homeDir: string | null = null;
      try {
        homeDir = await invoke<string>('get_home_directory');
      } catch {
        console.warn('[SkillsPluginsSettings] Could not determine home directory');
      }

      // 2. Load installed plugins from ~/.claude/plugins/installed_plugins.json
      const resolvedPlugins: ResolvedPlugin[] = [];
      if (homeDir) {
        try {
          const raw = await invoke<string>('file_read', {
            path: `${homeDir}/.claude/plugins/installed_plugins.json`,
          });
          const data = JSON.parse(raw) as {
            version: number;
            plugins: Record<string, InstalledPluginRecord[]>;
          };

          for (const [key, records] of Object.entries(data.plugins ?? {})) {
            const { name, marketplace } = pluginIdFromKey(key);
            const latestRecord = records.sort(
              (a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime(),
            )[0];
            if (!latestRecord) continue;

            // Try to read plugin.json manifest from installPath
            let manifest: PluginManifest | null = null;
            try {
              const manifestRaw = await invoke<string>('file_read', {
                path: `${latestRecord.installPath}/plugin.json`,
              });
              manifest = JSON.parse(manifestRaw) as PluginManifest;
            } catch {
              // no manifest, use defaults
            }

            resolvedPlugins.push({
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
            });
          }

          resolvedPlugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
        } catch {
          // plugin registry not available
        }
      } // end if (homeDir)
      setPlugins(resolvedPlugins);

      // 3. Load project-level resources from .claude/ subdirectories
      if (projectRoot) {
        const claudeDir = `${projectRoot}/.claude`;

        // Commands
        const commandEntries = await tryDirList(`${claudeDir}/commands`);
        setCommands(
          commandEntries
            .filter((e) => e.is_file)
            .map((e) => ({ name: e.name, path: e.path }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );

        // Skills (each skill is a directory, so list skill dirs then their SKILL.md)
        const skillDirs = await tryDirList(`${claudeDir}/skills`);
        const skillEntries: ProjectEntry[] = [];
        for (const dir of skillDirs.filter((e) => e.is_dir)) {
          skillEntries.push({ name: dir.name, path: dir.path });
        }
        // Also md files directly in skills/
        for (const file of skillDirs.filter((e) => e.is_file)) {
          skillEntries.push({ name: file.name, path: file.path });
        }
        setSkills(skillEntries.sort((a, b) => a.name.localeCompare(b.name)));

        // Agents
        const agentEntries = await tryDirList(`${claudeDir}/agents`);
        setAgents(
          agentEntries
            .filter((e) => e.is_file)
            .map((e) => ({ name: e.name, path: e.path }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
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

  const totalProjectItems = commands.length + skills.length + agents.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-1">Skills &amp; Plugins</h3>
          <p className="text-sm text-muted-foreground">
            Installed plugins provide agents, skills, and tools. Project-level resources live in{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.claude/</code>.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
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

      {isNonTauri && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Plugin discovery requires the desktop app.
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
              title="Installed Plugins"
              count={plugins.length}
              expanded={pluginsExpanded}
              onToggle={() => setPluginsExpanded((v) => !v)}
            />
            {pluginsExpanded && (
              <div className="divide-y divide-border">
                {plugins.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No plugins installed. Install plugins via the Claude Code CLI.
                  </p>
                ) : (
                  plugins.map((p) => <PluginRow key={p.id} plugin={p} />)
                )}
              </div>
            )}
          </div>

          {/* Project Resources */}
          {totalProjectItems > 0 || allowedDirectories[0] ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Project Resources</h4>
                <p className="text-xs text-muted-foreground">
                  From{' '}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {allowedDirectories[0] ?? 'project'}/.claude/
                  </code>
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
                        No slash commands found in{' '}
                        <code className="text-xs">.claude/commands/</code>.
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
                        No skills found in <code className="text-xs">.claude/skills/</code>.
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
                        No agents found in <code className="text-xs">.claude/agents/</code>.
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
    </div>
  );
}

export default SkillsPluginsSettings;
