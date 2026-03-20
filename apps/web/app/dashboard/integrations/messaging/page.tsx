'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  TestTube2,
  Plus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessagingConnection {
  id: string;
  platform: string;
  is_active: boolean;
  connected_at: string;
  updated_at: string;
}

type Platform = 'slack' | 'telegram' | 'whatsapp';

interface PlatformMeta {
  id: Platform;
  label: string;
  description: string;
  color: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORMS: PlatformMeta[] = [
  {
    id: 'slack',
    label: 'Slack',
    description: 'Send and receive messages via Slack workspace',
    color: 'text-purple-400',
    fields: [
      {
        key: 'workspaceUrl',
        label: 'Workspace URL',
        placeholder: 'https://your-team.slack.com',
      },
      {
        key: 'botToken',
        label: 'Bot Token',
        placeholder: 'xoxb-...',
        type: 'password',
      },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Connect a Telegram bot for messaging',
    color: 'text-blue-400',
    fields: [
      {
        key: 'token',
        label: 'Bot Token',
        placeholder: '123456:ABC-DEF...',
        type: 'password',
      },
      {
        key: 'chatId',
        label: 'Chat ID (optional)',
        placeholder: '@channel or numeric ID',
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Connect via WhatsApp Business API',
    color: 'text-green-400',
    fields: [
      {
        key: 'phone',
        label: 'Phone Number',
        placeholder: '+1234567890',
      },
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'Your WhatsApp API key',
        type: 'password',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf-token='))
      ?.split('=')[1] ?? ''
  );
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('supabase_access_token') : null;
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': getCsrfToken(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// Connect Form
// ---------------------------------------------------------------------------

function ConnectForm({
  platform,
  onSuccess,
  onCancel,
}: {
  platform: PlatformMeta;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/messaging/test/${platform.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ config: fields }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      setTestResult(data);
      if (data.success) {
        toast.success('Connection test passed');
      } else {
        toast.error(data.error ?? 'Connection test failed');
      }
    } catch {
      setTestResult({ success: false, error: 'Network error' });
      toast.error('Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/messaging/config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ platform: platform.id, config: fields }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to save');
      }
      toast.success(`${platform.label} connected`);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const hasRequiredFields = platform.fields.every((f) => (fields[f.key] ?? '').trim().length > 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Connect {platform.label}</h3>
        <button
          onClick={onCancel}
          className="rounded-md p-1 text-gray-400 hover:text-white transition-colors"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {platform.fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <label className="text-sm font-medium text-gray-300">{field.label}</label>
          <input
            type={field.type ?? 'text'}
            value={fields[field.key] ?? ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
          />
        </div>
      ))}

      {testResult && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            testResult.success
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          {testResult.success ? 'Connection test passed' : (testResult.error ?? 'Test failed')}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => void handleTest()}
          disabled={!hasRequiredFields || testing}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube2 className="h-4 w-4" />
          )}
          Test Connection
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={!hasRequiredFields || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Save Connection
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MessagingIntegrationPage() {
  const [connections, setConnections] = useState<MessagingConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/messaging/config', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = (await res.json()) as { connections?: MessagingConnection[] };
      setConnections(data.connections ?? []);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const handleDisconnect = async (platform: string) => {
    setDisconnecting(platform);
    try {
      const res = await fetch(`/api/messaging/config/${platform}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to disconnect');
      setConnections((prev) => prev.filter((c) => c.platform !== platform));
      toast.success(`${platform} disconnected`);
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(null);
    }
  };

  const connectedPlatforms = new Set(connections.map((c) => c.platform));
  const unconnectedPlatforms = PLATFORMS.filter((p) => !connectedPlatforms.has(p.id));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquare className="h-8 w-8 text-white" />
        <div>
          <h1 className="text-xl font-bold text-white">Messaging Integrations</h1>
          <p className="text-sm text-gray-400">
            Connect messaging platforms to send and receive AI responses
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading connections...
        </div>
      ) : (
        <>
          {/* Connected platforms */}
          {connections.map((conn) => {
            const meta = PLATFORMS.find((p) => p.id === conn.platform);
            return (
              <div key={conn.id} className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <div>
                      <p className="font-medium text-white">{meta?.label ?? conn.platform}</p>
                      <p className="text-xs text-gray-400">
                        Connected {new Date(conn.connected_at).toLocaleDateString()} &middot;{' '}
                        {conn.is_active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleDisconnect(conn.platform)}
                    disabled={disconnecting === conn.platform}
                    className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  >
                    {disconnecting === conn.platform ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Disconnect
                  </button>
                </div>
              </div>
            );
          })}

          {/* Connect form (if adding a new platform) */}
          {connectingPlatform && (
            <ConnectForm
              platform={PLATFORMS.find((p) => p.id === connectingPlatform)!}
              onSuccess={() => {
                setConnectingPlatform(null);
                void fetchConnections();
              }}
              onCancel={() => setConnectingPlatform(null)}
            />
          )}

          {/* Available platforms to connect */}
          {!connectingPlatform && unconnectedPlatforms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-gray-400">Available Platforms</h2>
              {unconnectedPlatforms.map((platform) => (
                <div key={platform.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                        <MessageSquare className={`h-5 w-5 ${platform.color}`} />
                      </div>
                      <div>
                        <p className="font-medium text-white">{platform.label}</p>
                        <p className="text-xs text-gray-400">{platform.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setConnectingPlatform(platform.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Connect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All connected state */}
          {!connectingPlatform && unconnectedPlatforms.length === 0 && connections.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-sm text-emerald-300">All available platforms are connected.</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Info banner */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            Messaging integrations are in early access. Platform APIs will be fully connected in a
            future update. Configuration is saved and will activate automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
