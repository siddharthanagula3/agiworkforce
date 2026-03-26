import { dotfiles } from '@agiworkforce/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Puzzle,
  Save,
  Server,
  Settings,
  Trash2,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

// ── Types ──────────────────────────────────────────────────────────────────

interface McpServerEntry {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

interface DetectedTool {
  name: string;
  path: string;
  has_mcp: boolean;
  has_skills: boolean;
  has_instructions: boolean;
  mcp_config_path: string | null;
  skills_paths: string[];
}

interface SkillEntry {
  name: string;
  description: string;
  path: string;
  source: string;
}

// ── 1. Configuration Editor ────────────────────────────────────────────────

function ConfigEditorSection() {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [approvalMode, setApprovalMode] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await dotfiles.readSharedConfig();
        if (!mounted) return;
        setConfig(data);
        const defaults = (data['default'] ?? {}) as Record<string, unknown>;
        setModel((defaults['model'] as string) ?? '');
        setProvider((defaults['provider'] as string) ?? '');
        setApprovalMode((defaults['approval_mode'] as string) ?? '');
      } catch (err) {
        if (mounted) toast.error(`Failed to load config: ${String(err)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const defaults: Record<string, unknown> = {
        ...((config['default'] ?? {}) as Record<string, unknown>),
      };
      if (model) defaults['model'] = model;
      if (provider) defaults['provider'] = provider;
      if (approvalMode) defaults['approval_mode'] = approvalMode;
      await dotfiles.writeSharedConfig('default', defaults);
      toast.success('Configuration saved');
    } catch (err) {
      toast.error(`Failed to save config: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [config, model, provider, approvalMode]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading config...
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Configuration</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Shared settings from{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">~/.agiworkforce/config.toml</code>
      </p>
      <div className="space-y-3">
        {[
          { label: 'Model', value: model, onChange: setModel, placeholder: 'e.g. claude-opus-4-6' },
          {
            label: 'Provider',
            value: provider,
            onChange: setProvider,
            placeholder: 'e.g. anthropic',
          },
          {
            label: 'Approval Mode',
            value: approvalMode,
            onChange: setApprovalMode,
            placeholder: 'suggest | auto-edit | full-auto',
          },
        ].map((field) => (
          <div key={field.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm font-medium">{field.label}</span>
            <input
              type="text"
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              placeholder={field.placeholder}
              className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 2. MCP Servers ─────────────────────────────────────────────────────────

function McpServersSection() {
  const [servers, setServers] = useState<Record<string, McpServerEntry>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newArgs, setNewArgs] = useState('');

  const loadServers = useCallback(async () => {
    try {
      const data = await dotfiles.dotfileListMcpServers();
      setServers(data ?? {});
    } catch (err) {
      toast.error(`Failed to load MCP servers: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      const config: McpServerEntry = {
        command: newCommand || undefined,
        args: newArgs ? newArgs.split(/\s+/) : undefined,
      };
      await dotfiles.dotfileAddMcpServer(newName.trim(), config);
      toast.success(`Added MCP server: ${newName.trim()}`);
      setNewName('');
      setNewCommand('');
      setNewArgs('');
      setShowAdd(false);
      await loadServers();
    } catch (err) {
      toast.error(`Failed to add server: ${String(err)}`);
    }
  }, [newName, newCommand, newArgs, loadServers]);

  const handleRemove = useCallback(
    async (name: string) => {
      try {
        await dotfiles.dotfileRemoveMcpServer(name);
        toast.success(`Removed MCP server: ${name}`);
        await loadServers();
      } catch (err) {
        toast.error(`Failed to remove server: ${String(err)}`);
      }
    },
    [loadServers],
  );

  const serverEntries = Object.entries(servers);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold">MCP Servers</h3>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Servers configured in{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">~/.agiworkforce/mcp.json</code>
      </p>

      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Server name"
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            type="text"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            placeholder="Command (e.g. npx)"
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            type="text"
            value={newArgs}
            onChange={(e) => setNewArgs(e.target.value)}
            placeholder="Args (space-separated)"
            className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleAdd()} disabled={!newName.trim()}>
              Add Server
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading servers...
        </div>
      ) : serverEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No MCP servers configured.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {serverEntries.map(([name, entry]) => (
            <div key={name} className="flex items-center gap-3 px-4 py-3">
              <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{name}</span>
                <p className="text-xs text-muted-foreground truncate">
                  {entry.url
                    ? `HTTP: ${entry.url}`
                    : `stdio: ${entry.command ?? ''} ${(entry.args ?? []).join(' ')}`}
                </p>
              </div>
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {entry.url ? 'http' : 'stdio'}
              </span>
              <button
                type="button"
                onClick={() => void handleRemove(name)}
                className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove server"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 3. Ecosystem ───────────────────────────────────────────────────────────

function EcosystemSection() {
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = (await dotfiles.detectEcosystemTools()) as unknown as DetectedTool[];
        if (mounted) setTools(data);
      } catch (err) {
        if (mounted) toast.error(`Failed to detect ecosystem: ${String(err)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const imported = await dotfiles.importEcosystemMcpServers();
      toast.success(`Imported ${imported.length} MCP server(s)`);
    } catch (err) {
      toast.error(`Failed to import: ${String(err)}`);
    } finally {
      setImporting(false);
    }
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold">Ecosystem</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleImport()}
          disabled={importing}
        >
          {importing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="mr-1.5 h-3.5 w-3.5" />
          )}
          Import MCP Servers
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        AI tools and IDEs detected on this machine.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning...
        </div>
      ) : tools.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No AI tools detected.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {tools.map((tool) => (
            <div key={tool.name} className="flex items-center gap-3 px-4 py-3">
              <Puzzle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{tool.name}</span>
                <p className="text-xs text-muted-foreground truncate">{tool.path}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {tool.has_mcp && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                    MCP
                  </span>
                )}
                {tool.has_skills && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">
                    Skills
                  </span>
                )}
                {tool.has_instructions && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">
                    Instructions
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 4. Skills Browser ──────────────────────────────────────────────────────

function SkillsBrowserSection() {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = (await dotfiles.dotfileListSkills()) as unknown as SkillEntry[];
        if (mounted) setSkills(data);
      } catch (err) {
        if (mounted) toast.error(`Failed to load skills: ${String(err)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Skills</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Discovered in{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">~/.agiworkforce/skills/</code>
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning skills...
        </div>
      ) : skills.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No skills found.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {skills.map((skill) => (
            <div key={skill.path} className="flex items-center gap-3 px-4 py-3">
              <Zap className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{skill.name}</span>
                <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
              </div>
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {skill.source}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 5. Instructions Editor ─────────────────────────────────────────────────

function InstructionsEditorSection() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const baselineRef = useRef('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await dotfiles.dotfileReadInstructions();
        if (!mounted) return;
        setContent(data);
        baselineRef.current = data;
      } catch (err) {
        if (mounted) toast.error(`Failed to load instructions: ${String(err)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await dotfiles.dotfileWriteInstructions(content);
      baselineRef.current = content;
      toast.success('Instructions saved');
    } catch (err) {
      toast.error(`Failed to save instructions: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [content]);

  const isDirty = content !== baselineRef.current;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading instructions...
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Instructions</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Global instructions from{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">
          ~/.agiworkforce/INSTRUCTIONS.md
        </code>
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
        placeholder="Write global instructions for all agents..."
      />
      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving || !isDirty}>
          {saving ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-2 h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

// ── 6. Memory Viewer ───────────────────────────────────────────────────────

function MemoryViewerSection() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await dotfiles.dotfileReadMemories();
        if (mounted) setContent(data);
      } catch (err) {
        if (mounted) toast.error(`Failed to load memories: ${String(err)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading memories...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold">Memories</h3>
        {content && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Read-only view of{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">
          ~/.agiworkforce/memories/raw_memories.md
        </code>
      </p>
      {!content ? (
        <p className="text-sm text-muted-foreground py-2">No memories stored yet.</p>
      ) : (
        <pre
          className={cn(
            'rounded-md border border-input bg-background px-3 py-2 text-xs font-mono whitespace-pre-wrap overflow-y-auto',
            expanded ? 'max-h-96' : 'max-h-40',
          )}
        >
          {content}
        </pre>
      )}
    </div>
  );
}

// ── Root panel ─────────────────────────────────────────────────────────────

export function DotfileSettings() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2.5">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">CLI Configuration</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the shared{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">~/.agiworkforce/</code> dotfile
              directory used by both the desktop app and CLI.
            </p>
          </div>
        </div>
      </div>

      <ConfigEditorSection />

      <div className="pt-6 border-t border-border">
        <McpServersSection />
      </div>

      <div className="pt-6 border-t border-border">
        <EcosystemSection />
      </div>

      <div className="pt-6 border-t border-border">
        <SkillsBrowserSection />
      </div>

      <div className="pt-6 border-t border-border">
        <InstructionsEditorSection />
      </div>

      <div className="pt-6 border-t border-border">
        <MemoryViewerSection />
      </div>
    </div>
  );
}
