import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/Dialog';

interface MessagingConnection {
  id: string;
  user_id: string;
  platform: 'Slack' | 'WhatsApp' | 'Teams';
  workspace_id?: string;
  workspace_name?: string;
  is_active: boolean;
  created_at: number;
  last_used_at?: number;
}

interface ConnectSlackRequest {
  user_id: string;
  bot_token: string;
  app_token: string;
  signing_secret: string;
  workspace_id?: string;
  workspace_name?: string;
}

interface ConnectWhatsAppRequest {
  user_id: string;
  phone_number_id: string;
  access_token: string;
  verify_token: string;
}

interface ConnectTeamsRequest {
  user_id: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  workspace_name?: string;
}

export const MessagingIntegrations: React.FC<{ userId: string }> = ({ userId }) => {
  const [connections, setConnections] = useState<MessagingConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showSlackModal, setShowSlackModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showTeamsModal, setShowTeamsModal] = useState(false);

  // Slack form state
  const [slackBotToken, setSlackBotToken] = useState('');
  const [slackAppToken, setSlackAppToken] = useState('');
  const [slackSigningSecret, setSlackSigningSecret] = useState('');
  const [slackWorkspaceName, setSlackWorkspaceName] = useState('');

  // WhatsApp form state
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('');
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState('');

  // Teams form state
  const [teamsTenantId, setTeamsTenantId] = useState('');
  const [teamsClientId, setTeamsClientId] = useState('');
  const [teamsClientSecret, setTeamsClientSecret] = useState('');
  const [teamsWorkspaceName, setTeamsWorkspaceName] = useState('');

  const loadConnections = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<MessagingConnection[]>('list_messaging_connections', {
        userId,
      });
      setConnections(result);
      setError(null);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleConnectSlack = async () => {
    try {
      const request: ConnectSlackRequest = {
        user_id: userId,
        bot_token: slackBotToken,
        app_token: slackAppToken,
        signing_secret: slackSigningSecret,
        workspace_name: slackWorkspaceName || undefined,
      };

      await invoke<MessagingConnection>('connect_slack', { request });

      // Reset form and close modal
      setSlackBotToken('');
      setSlackAppToken('');
      setSlackSigningSecret('');
      setSlackWorkspaceName('');
      setShowSlackModal(false);

      // Reload connections
      await loadConnections();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleConnectWhatsApp = async () => {
    try {
      const request: ConnectWhatsAppRequest = {
        user_id: userId,
        phone_number_id: whatsappPhoneNumberId,
        access_token: whatsappAccessToken,
        verify_token: whatsappVerifyToken,
      };

      await invoke<MessagingConnection>('connect_whatsapp', { request });

      setWhatsappPhoneNumberId('');
      setWhatsappAccessToken('');
      setWhatsappVerifyToken('');
      setShowWhatsAppModal(false);

      await loadConnections();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleConnectTeams = async () => {
    try {
      const request: ConnectTeamsRequest = {
        user_id: userId,
        tenant_id: teamsTenantId,
        client_id: teamsClientId,
        client_secret: teamsClientSecret,
        workspace_name: teamsWorkspaceName || undefined,
      };

      await invoke<MessagingConnection>('connect_teams', { request });

      setTeamsTenantId('');
      setTeamsClientId('');
      setTeamsClientSecret('');
      setTeamsWorkspaceName('');
      setShowTeamsModal(false);

      await loadConnections();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!confirm('Are you sure you want to disconnect this platform?')) {
      return;
    }

    try {
      await invoke('disconnect_platform', { connectionId });
      await loadConnections();
    } catch (err) {
      setError(err as string);
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'Slack':
        return '💬';
      case 'WhatsApp':
        return '📱';
      case 'Teams':
        return '👥';
      default:
        return '📨';
    }
  };

  if (loading) {
    return <div className="p-4">Loading messaging integrations...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Messaging Integrations</h1>
        <p className="text-gray-600">
          Connect AGI Workforce to messaging platforms like Slack, WhatsApp, and Microsoft Teams
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-6 text-center">
          <div className="text-4xl mb-2">💬</div>
          <h3 className="font-semibold mb-2">Slack</h3>
          <p className="text-sm text-gray-600 mb-4">
            Connect to Slack workspaces and channels
          </p>
          <Button onClick={() => setShowSlackModal(true)} className="w-full">
            Connect Slack
          </Button>
        </Card>

        <Card className="p-6 text-center">
          <div className="text-4xl mb-2">📱</div>
          <h3 className="font-semibold mb-2">WhatsApp</h3>
          <p className="text-sm text-gray-600 mb-4">
            Connect WhatsApp Business API
          </p>
          <Button onClick={() => setShowWhatsAppModal(true)} className="w-full">
            Connect WhatsApp
          </Button>
        </Card>

        <Card className="p-6 text-center">
          <div className="text-4xl mb-2">👥</div>
          <h3 className="font-semibold mb-2">Microsoft Teams</h3>
          <p className="text-sm text-gray-600 mb-4">
            Connect to Microsoft Teams
          </p>
          <Button onClick={() => setShowTeamsModal(true)} className="w-full">
            Connect Teams
          </Button>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Connected Platforms</h2>
        {connections.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No messaging platforms connected yet
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((connection) => (
              <Card key={connection.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{getPlatformIcon(connection.platform)}</div>
                  <div>
                    <div className="font-medium">{connection.platform}</div>
                    {connection.workspace_name && (
                      <div className="text-sm text-gray-600">{connection.workspace_name}</div>
                    )}
                    <div className="text-xs text-gray-500">
                      Connected {new Date(connection.created_at * 1000).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      connection.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {connection.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDisconnect(connection.id)}
                  >
                    Disconnect
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Slack Modal */}
      <Dialog open={showSlackModal} onOpenChange={setShowSlackModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to Slack</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Bot Token</label>
              <Input
                type="password"
                value={slackBotToken}
                onChange={(e) => setSlackBotToken(e.target.value)}
                placeholder="xoxb-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">App Token</label>
              <Input
                type="password"
                value={slackAppToken}
                onChange={(e) => setSlackAppToken(e.target.value)}
                placeholder="xapp-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Signing Secret</label>
              <Input
                type="password"
                value={slackSigningSecret}
                onChange={(e) => setSlackSigningSecret(e.target.value)}
                placeholder="Enter signing secret"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Workspace Name (optional)
              </label>
              <Input
                value={slackWorkspaceName}
                onChange={(e) => setSlackWorkspaceName(e.target.value)}
                placeholder="My Workspace"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSlackModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectSlack}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Modal */}
      <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to WhatsApp Business</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number ID</label>
              <Input
                value={whatsappPhoneNumberId}
                onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                placeholder="Enter phone number ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Access Token</label>
              <Input
                type="password"
                value={whatsappAccessToken}
                onChange={(e) => setWhatsappAccessToken(e.target.value)}
                placeholder="Enter access token"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Webhook Verify Token</label>
              <Input
                type="password"
                value={whatsappVerifyToken}
                onChange={(e) => setWhatsappVerifyToken(e.target.value)}
                placeholder="Enter verify token"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWhatsAppModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectWhatsApp}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Teams Modal */}
      <Dialog open={showTeamsModal} onOpenChange={setShowTeamsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to Microsoft Teams</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tenant ID</label>
              <Input
                value={teamsTenantId}
                onChange={(e) => setTeamsTenantId(e.target.value)}
                placeholder="Enter tenant ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Client ID</label>
              <Input
                value={teamsClientId}
                onChange={(e) => setTeamsClientId(e.target.value)}
                placeholder="Enter client ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Client Secret</label>
              <Input
                type="password"
                value={teamsClientSecret}
                onChange={(e) => setTeamsClientSecret(e.target.value)}
                placeholder="Enter client secret"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Workspace Name (optional)
              </label>
              <Input
                value={teamsWorkspaceName}
                onChange={(e) => setTeamsWorkspaceName(e.target.value)}
                placeholder="My Organization"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTeamsModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectTeams}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
