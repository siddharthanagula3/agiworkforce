import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Globe2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { McpClient } from '@/api/mcp';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/Dialog';
import { Input } from '@/ui/Input';
import { Label } from '@/ui/Label';
import { Switch } from '@/ui/Switch';
import { Textarea } from '@/ui/Textarea';
import type { DesktopMcpServerConfig } from '@/types/mcp';

interface CustomRemoteMcpConnectorDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (serverName: string, message: string) => void;
}

export interface RemoteMcpConnectorDraft {
  displayName: string;
  url: string;
  bearerToken: string;
  headersJson: string;
  timeoutSecs: number;
  verifySsl: boolean;
}

export interface RemoteMcpConnectorEntry {
  serverName: string;
  config: DesktopMcpServerConfig;
}

const DEFAULT_DRAFT: RemoteMcpConnectorDraft = {
  displayName: 'Custom connector',
  url: '',
  bearerToken: '',
  headersJson: '',
  timeoutSecs: 30,
  verifySsl: true,
};

function slugifyServerName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54);

  return `custom-${slug || 'remote-mcp'}`;
}

function normalizeHttpUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Remote MCP URL must start with http:// or https://');
  }
  return parsed.toString();
}

function parseHeadersJson(value: string): Record<string, string> {
  const trimmed = value.trim();
  if (!trimmed) return {};

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object');
  }

  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, headerValue]) => {
      if (typeof headerValue !== 'string') {
        throw new Error(`Header "${key}" must be a string`);
      }
      return [key, headerValue];
    }),
  );
}

export function buildRemoteMcpConnectorEntry(
  draft: RemoteMcpConnectorDraft,
): RemoteMcpConnectorEntry {
  const url = normalizeHttpUrl(draft.url);
  const headers = parseHeadersJson(draft.headersJson);
  const bearerToken = draft.bearerToken.trim();
  const serverName = slugifyServerName(draft.displayName);

  return {
    serverName,
    config: {
      command: '',
      args: [],
      env: {},
      enabled: true,
      transport: {
        type: 'http',
        url,
        api_key: null,
        bearer_token: bearerToken ? `<from_api_key:${serverName}>` : null,
        headers,
        timeout_secs: draft.timeoutSecs,
        verify_ssl: draft.verifySsl,
      },
    },
  };
}

export function CustomRemoteMcpConnectorDialog({
  open,
  onClose,
  onSaved,
}: CustomRemoteMcpConnectorDialogProps) {
  const [draft, setDraft] = useState<RemoteMcpConnectorDraft>(DEFAULT_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraft(DEFAULT_DRAFT);
      setError(null);
      setSaving(false);
      setAdvancedOpen(false);
    }
  }, [open]);

  const previewName = useMemo(() => slugifyServerName(draft.displayName), [draft.displayName]);

  const updateDraft = <K extends keyof RemoteMcpConnectorDraft>(
    key: K,
    value: RemoteMcpConnectorDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const entry = buildRemoteMcpConnectorEntry(draft);
      if (draft.bearerToken.trim()) {
        await McpClient.saveApiKey(entry.serverName, draft.bearerToken.trim());
      }
      const currentConfig = await McpClient.getConfig();
      const result = await McpClient.updateConfig({
        mcpServers: {
          ...currentConfig.mcpServers,
          [entry.serverName]: entry.config,
        },
      });

      onSaved?.(entry.serverName, result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the connector');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="w-[min(520px,calc(100vw-40px))] max-w-none gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="text-xl leading-tight">Add custom connector</DialogTitle>
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] uppercase">
              Beta
            </Badge>
          </div>
          <DialogDescription className="mt-1">
            Connect a remote MCP server from a trusted provider or your own infrastructure.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(680px,calc(100vh-220px))] space-y-5 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="custom-mcp-name">Name</Label>
            <Input
              id="custom-mcp-name"
              value={draft.displayName}
              onChange={(event) => updateDraft('displayName', event.target.value)}
              placeholder="Acme MCP"
            />
            <p className="text-xs text-muted-foreground">
              Saved as <span className="font-mono text-foreground/80">{previewName}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-mcp-url">Remote MCP URL</Label>
            <div className="relative">
              <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="custom-mcp-url"
                value={draft.url}
                onChange={(event) => updateDraft('url', event.target.value)}
                placeholder="https://mcp.example.com"
                className="pl-9"
              />
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
            <div className="flex items-start gap-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Only add connectors you trust. Remote MCP servers can receive the context and data
                you choose to send.
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground"
              onClick={() => setAdvancedOpen((value) => !value)}
              aria-expanded={advancedOpen}
            >
              Advanced settings
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  advancedOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {advancedOpen && (
              <div className="space-y-4 border-t border-border px-3 py-4">
                <div className="space-y-2">
                  <Label htmlFor="custom-mcp-token">Bearer token</Label>
                  <Input
                    id="custom-mcp-token"
                    type="password"
                    value={draft.bearerToken}
                    onChange={(event) => updateDraft('bearerToken', event.target.value)}
                    placeholder="Optional"
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted; the MCP config keeps a placeholder.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="custom-mcp-headers">Headers JSON</Label>
                  <Textarea
                    id="custom-mcp-headers"
                    value={draft.headersJson}
                    onChange={(event) => updateDraft('headersJson', event.target.value)}
                    placeholder='{"X-Workspace": "engineering"}'
                    className="min-h-24 font-mono text-xs"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                  <div className="space-y-2">
                    <Label htmlFor="custom-mcp-timeout">Timeout</Label>
                    <Input
                      id="custom-mcp-timeout"
                      type="number"
                      min={5}
                      max={300}
                      value={draft.timeoutSecs}
                      onChange={(event) =>
                        updateDraft('timeoutSecs', Number.parseInt(event.target.value, 10) || 30)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Verify SSL certificates</p>
                        <p className="text-xs text-muted-foreground">
                          Keep enabled for public servers.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={draft.verifySsl}
                      onCheckedChange={(checked) => updateDraft('verifySsl', checked)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !draft.url.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
