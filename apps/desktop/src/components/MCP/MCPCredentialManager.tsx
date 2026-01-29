import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Alert, AlertDescription } from '../ui/Alert';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import {
  Github,
  Cloud,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Loader2,
  Key,
  Eye,
  EyeOff,
  Save,
  ExternalLink,
} from 'lucide-react';
import type { McpServerInfo } from '../../types/mcp';
import { invoke, openUrl } from '../../lib/tauri-mock';
import { useMcpStore } from '../../stores/mcpStore';

interface MCPCredentialManagerProps {
  servers: McpServerInfo[];
}

// OAuth providers configuration
const OAUTH_PROVIDERS = {
  github: {
    name: 'GitHub',
    icon: Github,
    description: 'Connect your GitHub account for repository access',
    scopes: ['repo', 'read:user'],
  },
  'google-drive': {
    name: 'Google Drive',
    icon: Cloud,
    description: 'Connect your Google Drive for file access',
    scopes: ['drive.readonly', 'drive.file'],
  },
  slack: {
    name: 'Slack',
    icon: MessageSquare,
    description: 'Connect your Slack workspace for messaging',
    scopes: ['channels:read', 'chat:write'],
  },
} as const;

// Manual credential configs for providers without OAuth
const MANUAL_CREDENTIAL_CONFIGS: Record<
  string,
  Array<{ key: string; label: string; placeholder: string }>
> = {};

type OAuthProvider = keyof typeof OAUTH_PROVIDERS;

interface OAuthStatus {
  connected: boolean;
  user_info?: {
    name: string;
    email?: string;
    avatar_url?: string;
  };
}

interface OAuthState {
  status: Record<OAuthProvider, OAuthStatus>;
  loading: Record<OAuthProvider, boolean>;
  error: Record<OAuthProvider, string | null>;
}

export default function MCPCredentialManager({ servers }: MCPCredentialManagerProps) {
  const { storeCredential } = useMcpStore();

  // OAuth state
  const [oauthState, setOauthState] = useState<OAuthState>({
    status: {
      github: { connected: false },
      'google-drive': { connected: false },
      slack: { connected: false },
    },
    loading: {
      github: false,
      'google-drive': false,
      slack: false,
    },
    error: {
      github: null,
      'google-drive': null,
      slack: null,
    },
  });

  // Manual credential state
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState<Record<string, boolean>>({});

  // Check OAuth status for a provider
  const checkOAuthStatus = useCallback(async (provider: OAuthProvider) => {
    try {
      const result = await invoke<OAuthStatus>('mcp_oauth_status', { provider });
      setOauthState((prev) => ({
        ...prev,
        status: {
          ...prev.status,
          [provider]: result,
        },
        error: {
          ...prev.error,
          [provider]: null,
        },
      }));
    } catch (error) {
      console.error(`Failed to check OAuth status for ${provider}:`, error);
      // Don't set error here - just means not connected
      setOauthState((prev) => ({
        ...prev,
        status: {
          ...prev.status,
          [provider]: { connected: false },
        },
      }));
    }
  }, []);

  // Check all OAuth statuses on mount
  useEffect(() => {
    const providers = Object.keys(OAUTH_PROVIDERS) as OAuthProvider[];
    providers.forEach((provider) => {
      checkOAuthStatus(provider);
    });
  }, [checkOAuthStatus]);

  // Start OAuth flow
  const startOAuth = async (provider: OAuthProvider) => {
    setOauthState((prev) => ({
      ...prev,
      loading: { ...prev.loading, [provider]: true },
      error: { ...prev.error, [provider]: null },
    }));

    try {
      const result = await invoke<{ auth_url: string; state: string }>('mcp_oauth_start', {
        provider,
      });

      // Store OAuth state for CSRF verification on callback.
      // Note: This is a random nonce for CSRF protection, NOT a credential.
      // It's ephemeral and only used to verify the OAuth callback originated
      // from this same flow. Storing in sessionStorage is the standard approach.
      sessionStorage.setItem(`oauth_state_${provider}`, result.state);

      // Open browser for OAuth
      await openUrl(result.auth_url);

      // Keep loading state until callback completes
    } catch (error) {
      console.error(`Failed to start OAuth for ${provider}:`, error);
      setOauthState((prev) => ({
        ...prev,
        loading: { ...prev.loading, [provider]: false },
        error: {
          ...prev.error,
          [provider]: error instanceof Error ? error.message : 'Failed to start OAuth',
        },
      }));
    }
  };

  // Disconnect OAuth
  const disconnectOAuth = async (provider: OAuthProvider) => {
    setOauthState((prev) => ({
      ...prev,
      loading: { ...prev.loading, [provider]: true },
      error: { ...prev.error, [provider]: null },
    }));

    try {
      await invoke('mcp_oauth_disconnect', { provider });
      setOauthState((prev) => ({
        ...prev,
        status: {
          ...prev.status,
          [provider]: { connected: false },
        },
        loading: { ...prev.loading, [provider]: false },
      }));
    } catch (error) {
      console.error(`Failed to disconnect OAuth for ${provider}:`, error);
      setOauthState((prev) => ({
        ...prev,
        loading: { ...prev.loading, [provider]: false },
        error: {
          ...prev.error,
          [provider]: error instanceof Error ? error.message : 'Failed to disconnect',
        },
      }));
    }
  };

  // Handle OAuth callback from deep link
  const handleOAuthCallback = useCallback(
    async (provider: OAuthProvider, code: string, state: string) => {
      // Verify state matches
      const storedState = sessionStorage.getItem(`oauth_state_${provider}`);
      if (storedState !== state) {
        console.error(`OAuth state mismatch for ${provider}`);
        setOauthState((prev) => ({
          ...prev,
          loading: { ...prev.loading, [provider]: false },
          error: {
            ...prev.error,
            [provider]: 'OAuth state mismatch. Please try again.',
          },
        }));
        return;
      }

      // Clear stored state
      sessionStorage.removeItem(`oauth_state_${provider}`);

      try {
        await invoke('mcp_oauth_callback', { provider, code, state });
        // Refresh status
        await checkOAuthStatus(provider);
        setOauthState((prev) => ({
          ...prev,
          loading: { ...prev.loading, [provider]: false },
        }));
      } catch (error) {
        console.error(`Failed to complete OAuth for ${provider}:`, error);
        setOauthState((prev) => ({
          ...prev,
          loading: { ...prev.loading, [provider]: false },
          error: {
            ...prev.error,
            [provider]: error instanceof Error ? error.message : 'Failed to complete OAuth',
          },
        }));
      }
    },
    [checkOAuthStatus],
  );

  // Listen for OAuth completion via deep link events
  useEffect(() => {
    const handleDeepLink = (event: Event) => {
      const customEvent = event as CustomEvent<{ url?: string }>;
      const { url } = customEvent.detail;
      if (!url) return;

      try {
        const parsed = new URL(url);
        const pathParts = parsed.pathname.split('/').filter(Boolean);

        // Check for oauth/mcp/{provider} path pattern
        if (pathParts[0] === 'oauth' && pathParts[1] === 'mcp' && pathParts[2]) {
          const provider = pathParts[2] as OAuthProvider;
          const code = parsed.searchParams.get('code');
          const state = parsed.searchParams.get('state');

          if (code && state && provider in OAUTH_PROVIDERS) {
            handleOAuthCallback(provider, code, state);
          }
        }
      } catch (error) {
        console.error('Failed to parse OAuth deep link:', error);
      }
    };

    window.addEventListener('agi-deep-link', handleDeepLink);

    return () => {
      window.removeEventListener('agi-deep-link', handleDeepLink);
    };
  }, [handleOAuthCallback]);

  // Manual credential handlers
  const handleCredentialChange = (serverName: string, key: string, value: string) => {
    setCredentials((prev) => ({
      ...prev,
      [serverName]: {
        ...(prev[serverName] || {}),
        [key]: value,
      },
    }));
  };

  const toggleShow = (id: string) => {
    setShowCredentials((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSave = async (serverName: string, key: string) => {
    const value = credentials[serverName]?.[key];
    if (!value) return;

    const saveId = `${serverName}_${key}`;
    setSaving((prev) => ({ ...prev, [saveId]: true }));
    setSuccess((prev) => ({ ...prev, [saveId]: false }));

    try {
      await storeCredential(serverName, key, value);
      setSuccess((prev) => ({ ...prev, [saveId]: true }));
      setTimeout(() => {
        setSuccess((prev) => ({ ...prev, [saveId]: false }));
      }, 3000);
    } catch (error) {
      console.error('Failed to store credential:', error);
    } finally {
      setSaving((prev) => ({ ...prev, [saveId]: false }));
    }
  };

  // Filter servers based on what credentials they need
  const oauthServers = servers.filter((server) => server.name in OAUTH_PROVIDERS);
  const manualServers = servers.filter((server) => MANUAL_CREDENTIAL_CONFIGS[server.name]);

  if (oauthServers.length === 0 && manualServers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Key className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No credentials required</h3>
        <p className="text-sm text-muted-foreground">
          The configured servers don't require API keys or authentication
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          Connect your accounts securely via OAuth or enter API keys. Credentials are stored
          securely in your system keychain and never sent to external services except the providers
          you connect to.
        </AlertDescription>
      </Alert>

      {/* OAuth Providers */}
      {oauthServers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">OAuth Connections</h3>

          {oauthServers.map((server) => {
            const providerKey = server.name as OAuthProvider;
            const provider = OAUTH_PROVIDERS[providerKey];
            const Icon = provider.icon;
            const status = oauthState.status[providerKey];
            const isLoading = oauthState.loading[providerKey];
            const error = oauthState.error[providerKey];

            return (
              <Card key={server.name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{provider.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {provider.description}
                        </CardDescription>
                      </div>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        status.connected
                          ? 'bg-green-500'
                          : server.enabled
                            ? 'bg-yellow-500'
                            : 'bg-gray-400'
                      }`}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {error && (
                    <Alert variant="destructive" className="mb-3">
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {status.connected ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-sm">
                          Connected as{' '}
                          <span className="font-medium">{status.user_info?.name || 'User'}</span>
                        </span>
                        {status.user_info?.email && (
                          <span className="text-xs text-muted-foreground">
                            ({status.user_info.email})
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectOAuth(providerKey)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Disconnecting...
                          </>
                        ) : (
                          'Disconnect'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => startOAuth(providerKey)} disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Icon className="w-4 h-4 mr-2" />
                          Connect with {provider.name}
                          <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Manual API Key Providers */}
      {manualServers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">API Keys</h3>

          {manualServers.map((server) => {
            const credentialFields = MANUAL_CREDENTIAL_CONFIGS[server.name] || [];

            return (
              <Card key={server.name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        <Key className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{server.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          Configure API credentials for this server
                        </CardDescription>
                      </div>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full ${server.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    {credentialFields.map((field) => {
                      const inputId = `${server.name}_${field.key}`;
                      const isSaving = saving[inputId];
                      const isSuccess = success[inputId];
                      const showPassword = showCredentials[inputId];

                      return (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={inputId} className="text-sm">
                            {field.label}
                          </Label>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <Input
                                id={inputId}
                                type={showPassword ? 'text' : 'password'}
                                placeholder={field.placeholder}
                                value={credentials[server.name]?.[field.key] || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  handleCredentialChange(server.name, field.key, e.target.value)
                                }
                              />
                              <button
                                type="button"
                                onClick={() => toggleShow(inputId)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showPassword ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                            <Button
                              variant={isSuccess ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleSave(server.name, field.key)}
                              disabled={isSaving || !credentials[server.name]?.[field.key]}
                            >
                              {isSaving ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : isSuccess ? (
                                <>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Saved!
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4 mr-2" />
                                  Save
                                </>
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Stored securely in your system keychain
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
