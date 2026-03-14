import { useEffect, useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { useMcpServerStore } from '@/stores/mcpServerStore';

const ALL_TOOLS = ['agi_chat', 'agi_run_task', 'agi_execute_skill', 'agi_bash', 'agi_research'];

export function MCPServerSettings() {
  const { config, loading, error, fetchConfig, startServer, stopServer, updateConfig } =
    useMcpServerStore();
  const [copied, setCopied] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [portValue, setPortValue] = useState('9090');

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    setPortValue(String(config?.port ?? 9090));
  }, [config?.port]);

  const copySnippet = async () => {
    if (!config) return;
    const snippet = JSON.stringify(
      {
        'agi-workforce': {
          type: 'http',
          url: `http://localhost:${config.port}/mcp`,
          headers: { Authorization: `Bearer ${config.token}` },
        },
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleTool = async (tool: string) => {
    if (!config) return;
    const current = config.enabled_tools;
    const next = current.includes(tool) ? current.filter((t) => t !== tool) : [...current, tool];
    await updateConfig(undefined, next);
  };

  const handlePortBlur = async () => {
    if (!config) return;
    const parsed = Number(portValue);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      setPortValue(String(config.port));
      return;
    }
    if (parsed !== config.port) {
      await updateConfig(parsed, undefined);
    }
  };

  if (loading && !config) {
    return <div className="p-6 text-sm text-muted-foreground">Loading MCP server config...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Share2 className="h-5 w-5 text-blue-400" />
        <div>
          <h3 className="text-lg font-semibold">MCP Server</h3>
          <p className="text-sm text-muted-foreground">
            Expose AGI Workforce as an MCP server for Claude Desktop, Cursor, and other tools.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Enable/disable */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-2.5 w-2.5 rounded-full ${config?.running ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`}
          />
          <span className="text-sm">
            {config?.running ? `Running on port ${config.port}` : 'Stopped'}
          </span>
        </div>
        <button type="button"
          onClick={config?.running ? stopServer : startServer}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            config?.running
              ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {config?.running ? 'Stop' : 'Start Server'}
        </button>
      </div>

      {/* Port */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Port</label>
        <input
          type="number"
          value={portValue}
          onChange={(e) => setPortValue(e.target.value)}
          onBlur={() => void handlePortBlur()}
          disabled={config?.running}
          className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        />
        {config?.running && (
          <p className="text-xs text-muted-foreground">Stop server to change port</p>
        )}
      </div>

      {/* Bearer token */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Bearer Token</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground font-mono">
            {tokenVisible ? config?.token : '\u2022'.repeat(36)}
          </code>
          <button type="button"
            onClick={() => setTokenVisible((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {tokenVisible ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Tools */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Exposed Tools</label>
        <div className="space-y-2">
          {ALL_TOOLS.map((tool) => (
            <label
              key={tool}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 hover:bg-muted/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={config?.enabled_tools.includes(tool) ?? false}
                onChange={() => toggleTool(tool)}
                className="rounded"
              />
              <span className="text-sm font-mono">{tool}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Copy .mcp.json snippet */}
      <button type="button"
        onClick={copySnippet}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Copy Claude Desktop .mcp.json snippet'}
      </button>
    </div>
  );
}
