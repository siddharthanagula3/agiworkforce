import { AlertCircle, Globe2, Loader2, Server, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { McpClient } from '@/api/mcp';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
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

  useEffect(() => {
    if (!open) {
      setDraft(DEFAULT_DRAFT);
      setError(null);
      setSaving(false);
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
      <DialogContent className="w-[min(620px,calc(100vw-40px))] max-w-none gap-0 overflow-hidden rounded-2xl border-border/70 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60">
              <Server className="h-5 w-5 text-foreground" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl leading-tight">Add custom connector</DialogTitle>
              <DialogDescription className="mt-1 max-w-[44rem]">
                Connect a remote MCP server from a trusted provider or your own infrastructure.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[min(680px,calc(100vh-220px))] space-y-5 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_1.1fr]">
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
          </div>

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

          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
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

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Verify SSL certificates</p>
                  <p className="text-xs text-muted-foreground">Keep enabled for public servers.</p>
                </div>
              </div>
              <Switch
                checked={draft.verifySsl}
                onCheckedChange={(checked) => updateDraft('verifySsl', checked)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !draft.url.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add connector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
