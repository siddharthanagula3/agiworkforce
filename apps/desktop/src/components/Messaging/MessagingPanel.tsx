import { invoke } from '@/lib/tauri-mock';
import { MessageSquare, Plus, RefreshCcw, Send, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Separator } from '../ui/Separator';
import { Textarea } from '../ui/Textarea';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessagingConnection {
  id: string;
  user_id: string;
  platform: string;
  workspace_id: string | null;
  workspace_name: string | null;
  is_active: boolean;
  created_at: number;
  last_used_at: number | null;
}

interface PlatformStatus {
  platform: string;
  connected: boolean;
  error: string | null;
}

interface UnifiedMessage {
  id: string;
  platform: string;
  channel_id: string;
  sender: string;
  content: string;
  timestamp: number;
  attachments: unknown[];
  metadata: unknown;
}

const PLATFORM_LABELS: Record<string, string> = {
  slack: 'Slack',
  whatsapp: 'WhatsApp',
  teams: 'Microsoft Teams',
  discord: 'Discord',
  telegram: 'Telegram',
  signal: 'Signal',
};

const DB_PLATFORMS = ['slack', 'whatsapp', 'teams'] as const;
const STATE_PLATFORMS = ['discord', 'telegram', 'signal'] as const;

// ─── Connection Status Badge ──────────────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        connected
          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {connected ? 'Connected' : 'Disconnected'}
    </span>
  );
}

// ─── Connect Forms ────────────────────────────────────────────────────────────

function ConnectSlackForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    botToken: '',
    appToken: '',
    signingSecret: '',
    workspaceName: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.botToken || !form.appToken || !form.signingSecret) {
      toast.error('Bot token, app token, and signing secret are required.');
      return;
    }
    setLoading(true);
    try {
      await invoke('connect_slack', {
        request: {
          user_id: 'local',
          bot_token: form.botToken,
          app_token: form.appToken,
          signing_secret: form.signingSecret,
          workspace_name: form.workspaceName || null,
          workspace_id: null,
        },
      });
      toast.success('Slack connected.');
      onSuccess();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Bot Token</label>
          <Input
            type="password"
            placeholder="xoxb-..."
            value={form.botToken}
            onChange={(e) => setForm((f) => ({ ...f, botToken: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">App Token</label>
          <Input
            type="password"
            placeholder="xapp-..."
            value={form.appToken}
            onChange={(e) => setForm((f) => ({ ...f, appToken: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Signing Secret</label>
          <Input
            type="password"
            placeholder="Signing secret"
            value={form.signingSecret}
            onChange={(e) => setForm((f) => ({ ...f, signingSecret: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Workspace Name (optional)
          </label>
          <Input
            placeholder="my-workspace"
            value={form.workspaceName}
            onChange={(e) => setForm((f) => ({ ...f, workspaceName: e.target.value }))}
          />
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={loading} className="w-fit">
        {loading ? 'Connecting...' : 'Connect Slack'}
      </Button>
    </div>
  );
}

function ConnectWhatsAppForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ phoneNumberId: '', accessToken: '', verifyToken: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.phoneNumberId || !form.accessToken || !form.verifyToken) {
      toast.error('All fields are required.');
      return;
    }
    setLoading(true);
    try {
      await invoke('connect_whatsapp', {
        request: {
          user_id: 'local',
          phone_number_id: form.phoneNumberId,
          access_token: form.accessToken,
          verify_token: form.verifyToken,
        },
      });
      toast.success('WhatsApp connected.');
      onSuccess();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Phone Number ID</label>
          <Input
            placeholder="1234567890"
            value={form.phoneNumberId}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Access Token</label>
          <Input
            type="password"
            placeholder="EAAx..."
            value={form.accessToken}
            onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Verify Token</label>
          <Input
            type="password"
            placeholder="Webhook verify token"
            value={form.verifyToken}
            onChange={(e) => setForm((f) => ({ ...f, verifyToken: e.target.value }))}
          />
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={loading} className="w-fit">
        {loading ? 'Connecting...' : 'Connect WhatsApp'}
      </Button>
    </div>
  );
}

function ConnectTeamsForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    tenantId: '',
    clientId: '',
    clientSecret: '',
    workspaceName: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.tenantId || !form.clientId || !form.clientSecret) {
      toast.error('Tenant ID, client ID, and client secret are required.');
      return;
    }
    setLoading(true);
    try {
      await invoke('connect_teams', {
        request: {
          user_id: 'local',
          tenant_id: form.tenantId,
          client_id: form.clientId,
          client_secret: form.clientSecret,
          workspace_name: form.workspaceName || null,
        },
      });
      toast.success('Microsoft Teams connected.');
      onSuccess();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Tenant ID</label>
          <Input
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={form.tenantId}
            onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Client ID</label>
          <Input
            placeholder="App (client) ID"
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Client Secret</label>
          <Input
            type="password"
            placeholder="Client secret value"
            value={form.clientSecret}
            onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Workspace Name (optional)
          </label>
          <Input
            placeholder="My Team"
            value={form.workspaceName}
            onChange={(e) => setForm((f) => ({ ...f, workspaceName: e.target.value }))}
          />
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={loading} className="w-fit">
        {loading ? 'Connecting...' : 'Connect Teams'}
      </Button>
    </div>
  );
}

function ConnectDiscordForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ botToken: '', guildId: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.botToken) {
      toast.error('Bot token is required.');
      return;
    }
    setLoading(true);
    try {
      await invoke('messaging_connect_discord', {
        config: { bot_token: form.botToken, guild_id: form.guildId || null },
      });
      toast.success('Discord connected.');
      onSuccess();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Bot Token</label>
          <Input
            type="password"
            placeholder="MTAxN..."
            value={form.botToken}
            onChange={(e) => setForm((f) => ({ ...f, botToken: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Guild ID (optional)</label>
          <Input
            placeholder="Server / Guild ID"
            value={form.guildId}
            onChange={(e) => setForm((f) => ({ ...f, guildId: e.target.value }))}
          />
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={loading} className="w-fit">
        {loading ? 'Connecting...' : 'Connect Discord'}
      </Button>
    </div>
  );
}

function ConnectTelegramForm({ onSuccess }: { onSuccess: () => void }) {
  const [botToken, setBotToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!botToken) {
      toast.error('Bot token is required.');
      return;
    }
    setLoading(true);
    try {
      await invoke('messaging_connect_telegram', {
        config: { bot_token: botToken },
      });
      toast.success('Telegram connected.');
      onSuccess();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-1 max-w-sm">
        <label className="text-xs font-medium text-muted-foreground">Bot Token</label>
        <Input
          type="password"
          placeholder="1234567890:AAF..."
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
        />
      </div>
      <Button onClick={handleSubmit} disabled={loading} className="w-fit">
        {loading ? 'Connecting...' : 'Connect Telegram'}
      </Button>
    </div>
  );
}

function ConnectSignalForm({ onSuccess }: { onSuccess: () => void }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!phoneNumber) {
      toast.error('Phone number is required.');
      return;
    }
    setLoading(true);
    try {
      await invoke('messaging_connect_signal', {
        config: { phone_number: phoneNumber },
      });
      toast.success('Signal registered.');
      onSuccess();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-1 max-w-sm">
        <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
        <Input
          placeholder="+12025551234"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
      </div>
      <Button onClick={handleSubmit} disabled={loading} className="w-fit">
        {loading ? 'Registering...' : 'Register Signal'}
      </Button>
    </div>
  );
}

// ─── Send Message Form ────────────────────────────────────────────────────────

interface SendFormProps {
  connections: MessagingConnection[];
  statePlatformStatuses: PlatformStatus[];
  onSent: () => void;
}

function SendMessageForm({ connections, statePlatformStatuses, onSent }: SendFormProps) {
  const [platform, setPlatform] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const isDbPlatform = DB_PLATFORMS.includes(platform as (typeof DB_PLATFORMS)[number]);

  const filteredConnections = connections.filter((c) => c.platform === platform && c.is_active);

  const connectedStatePlatforms = statePlatformStatuses
    .filter((s) => s.connected)
    .map((s) => s.platform);

  const availableStatePlatforms = STATE_PLATFORMS.filter((p) =>
    connectedStatePlatforms.includes(p),
  );

  const handleSend = async () => {
    if (!platform || !channelId.trim() || !text.trim()) {
      toast.error('Platform, channel/recipient, and message are required.');
      return;
    }

    setLoading(true);
    try {
      if (isDbPlatform) {
        if (!connectionId) {
          toast.error('Select a connection.');
          return;
        }
        await invoke('send_message', {
          connectionId,
          channelId,
          text,
        });
      } else {
        await invoke('messaging_send', {
          platform,
          channelId,
          content: text,
        });
      }
      toast.success('Message sent.');
      setText('');
      onSent();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-4 flex flex-col gap-4">
      <div className="text-sm font-medium">Send a Message</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Platform</label>
          <Select
            value={platform}
            onValueChange={(v) => {
              setPlatform(v);
              setConnectionId('');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent>
              {DB_PLATFORMS.filter((p) =>
                connections.some((c) => c.platform === p && c.is_active),
              ).map((p) => (
                <SelectItem key={p} value={p}>
                  {PLATFORM_LABELS[p] ?? p}
                </SelectItem>
              ))}
              {availableStatePlatforms.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLATFORM_LABELS[p] ?? p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isDbPlatform && filteredConnections.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Connection</label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select connection" />
              </SelectTrigger>
              <SelectContent>
                {filteredConnections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.workspace_name ?? c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {platform === 'telegram'
              ? 'Chat ID'
              : platform === 'signal'
                ? 'Recipient Phone'
                : 'Channel / Recipient'}
          </label>
          <Input
            placeholder={
              platform === 'telegram'
                ? '−1001234567890'
                : platform === 'signal'
                  ? '+12025551234'
                  : '#general or channel ID'
            }
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Message</label>
        <Textarea
          placeholder="Type your message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>

      <Button onClick={handleSend} disabled={loading} className="w-fit">
        <Send className="mr-2 h-4 w-4" />
        {loading ? 'Sending...' : 'Send'}
      </Button>
    </div>
  );
}

// ─── Message History ──────────────────────────────────────────────────────────

interface HistoryViewProps {
  connection: MessagingConnection | null;
}

function MessageHistory({ connection }: HistoryViewProps) {
  const [channelId, setChannelId] = useState('');
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!connection || !channelId.trim()) return;
    setLoading(true);
    try {
      const result = await invoke<UnifiedMessage[]>('get_messaging_history', {
        connectionId: connection.id,
        channelId: channelId.trim(),
        limit: 50,
      });
      setMessages(result ?? []);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [connection, channelId]);

  if (!connection) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
        Select a connection from the list to view message history.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-muted-foreground">Channel ID</label>
          <Input
            placeholder="#channel or ID"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}>
          <RefreshCcw className="mr-2 h-3.5 w-3.5" />
          {loading ? 'Loading...' : 'Load'}
        </Button>
      </div>

      <ScrollArea className="h-64 rounded-lg border border-border/60 bg-card/40">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {loading ? 'Fetching messages...' : 'No messages. Enter a channel ID and click Load.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col rounded-md px-3 py-2 text-sm ${
                  msg.sender === 'local'
                    ? 'ml-auto max-w-[70%] bg-primary/10'
                    : 'mr-auto max-w-[70%] bg-muted/60'
                }`}
              >
                <span className="text-xs font-medium text-muted-foreground mb-0.5">
                  {msg.sender || 'Unknown'}
                </span>
                <span>{msg.content}</span>
                <span className="mt-1 text-[10px] text-muted-foreground self-end">
                  {new Date(msg.timestamp * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function MessagingPanel() {
  const [connections, setConnections] = useState<MessagingConnection[]>([]);
  const [statuses, setStatuses] = useState<PlatformStatus[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<MessagingConnection | null>(null);
  const [addPlatform, setAddPlatform] = useState<string>('');
  const [loadingConnections, setLoadingConnections] = useState(false);

  const refreshConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const [conns, stateStatuses] = await Promise.all([
        invoke<MessagingConnection[]>('list_messaging_connections', { userId: 'local' }).catch(
          () => [],
        ),
        invoke<PlatformStatus[]>('messaging_get_status').catch(() => []),
      ]);
      setConnections(conns ?? []);
      setStatuses(stateStatuses ?? []);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  const handleDisconnectDb = async (connectionId: string) => {
    try {
      await invoke('disconnect_platform', { connectionId });
      toast.success('Disconnected.');
      void refreshConnections();
      if (selectedConnection?.id === connectionId) {
        setSelectedConnection(null);
      }
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleDisconnectState = async (platform: string) => {
    try {
      await invoke('messaging_disconnect', { platform });
      toast.success(`${PLATFORM_LABELS[platform] ?? platform} disconnected.`);
      void refreshConnections();
    } catch (err) {
      toast.error(String(err));
    }
  };

  // Build combined view: DB connections + state-managed platforms

  const renderAddForm = () => {
    const onSuccess = () => {
      setAddPlatform('');
      void refreshConnections();
    };

    switch (addPlatform) {
      case 'slack':
        return <ConnectSlackForm onSuccess={onSuccess} />;
      case 'whatsapp':
        return <ConnectWhatsAppForm onSuccess={onSuccess} />;
      case 'teams':
        return <ConnectTeamsForm onSuccess={onSuccess} />;
      case 'discord':
        return <ConnectDiscordForm onSuccess={onSuccess} />;
      case 'telegram':
        return <ConnectTelegramForm onSuccess={onSuccess} />;
      case 'signal':
        return <ConnectSignalForm onSuccess={onSuccess} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Messaging Platforms
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect Discord, Telegram, Signal, Slack, WhatsApp, and Microsoft Teams.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshConnections}
          disabled={loadingConnections}
        >
          <RefreshCcw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <Separator />

      {/* Add Platform */}
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Add Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <Select value={addPlatform} onValueChange={setAddPlatform}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Choose a platform..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {addPlatform && (
          <div className="mt-2 rounded-md border border-border/40 bg-background/60 p-3">
            {renderAddForm()}
          </div>
        )}
      </div>

      {/* Connections List */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-muted-foreground">Active Connections</div>

        {/* DB-backed connections (Slack, WhatsApp, Teams) */}
        {connections
          .filter((c) => c.is_active)
          .map((conn) => (
            <div
              key={conn.id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                selectedConnection?.id === conn.id
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/60 bg-card/60 hover:bg-muted/40'
              }`}
              onClick={() => setSelectedConnection((prev) => (prev?.id === conn.id ? null : conn))}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {PLATFORM_LABELS[conn.platform] ?? conn.platform}
                  {conn.workspace_name ? ` — ${conn.workspace_name}` : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  Connected {new Date(conn.created_at * 1000).toLocaleDateString()}
                  {conn.last_used_at
                    ? ` · Last used ${new Date(conn.last_used_at * 1000).toLocaleDateString()}`
                    : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge connected={conn.is_active} />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDisconnectDb(conn.id);
                  }}
                  title="Disconnect"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

        {/* State-managed platforms (Discord, Telegram, Signal) */}
        {statuses.map((status) => (
          <div
            key={status.platform}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-4 py-3"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {PLATFORM_LABELS[status.platform] ?? status.platform}
              </span>
              {status.error && <span className="text-xs text-destructive">{status.error}</span>}
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge connected={status.connected} />
              {status.connected && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void handleDisconnectState(status.platform)}
                  title="Disconnect"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}

        {connections.filter((c) => c.is_active).length === 0 &&
          statuses.filter((s) => s.connected).length === 0 && (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
              No platforms connected. Use the form above to add one.
            </div>
          )}
      </div>

      <Separator />

      {/* Send Message */}
      <SendMessageForm
        connections={connections}
        statePlatformStatuses={statuses}
        onSent={refreshConnections}
      />

      <Separator />

      {/* Message History (for DB-backed connections only) */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-muted-foreground">Message History</div>
        <MessageHistory connection={selectedConnection} />
      </div>
    </div>
  );
}
