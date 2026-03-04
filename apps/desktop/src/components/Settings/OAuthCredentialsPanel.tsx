import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import { invoke } from '@/lib/tauri-mock';
import { toast } from '@/hooks/useToast';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Badge } from '../ui/Badge';

// Extended provider set for OAuth credentials configuration.
// These go beyond the three providers in McpOAuthProvider since
// credentials must be configurable for all OAuth-based connectors.
type OAuthCredentialProvider =
  | 'github'
  | 'google'
  | 'slack'
  | 'notion'
  | 'figma'
  | 'microsoft'
  | 'atlassian';

interface ProviderDef {
  id: OAuthCredentialProvider;
  name: string;
  description: string;
  docsUrl: string;
  clientIdLabel: string;
  clientSecretLabel: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repository access, issues, pull requests',
    docsUrl: 'https://github.com/settings/developers',
    clientIdLabel: 'Client ID',
    clientSecretLabel: 'Client Secret',
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gmail, Drive, Calendar, Sheets',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    clientIdLabel: 'Client ID',
    clientSecretLabel: 'Client Secret',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Messaging, channels, workspace management',
    docsUrl: 'https://api.slack.com/apps',
    clientIdLabel: 'Client ID',
    clientSecretLabel: 'Client Secret',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages, databases, workspace content',
    docsUrl: 'https://www.notion.so/my-integrations',
    clientIdLabel: 'OAuth Client ID',
    clientSecretLabel: 'OAuth Client Secret',
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Design files, components, prototypes',
    docsUrl: 'https://www.figma.com/developers/apps',
    clientIdLabel: 'Client ID',
    clientSecretLabel: 'Client Secret',
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    description: 'Outlook, OneDrive, Teams, Office 365',
    docsUrl: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    clientIdLabel: 'Application (client) ID',
    clientSecretLabel: 'Client Secret Value',
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    description: 'Jira, Confluence, Bitbucket',
    docsUrl: 'https://developer.atlassian.com/console/myapps/',
    clientIdLabel: 'Client ID',
    clientSecretLabel: 'Client Secret',
  },
];

interface ProviderCredentialState {
  clientId: string;
  clientSecret: string;
  showSecret: boolean;
  saving: boolean;
  configured: boolean;
  expanded: boolean;
}

function makeInitialState(): Record<OAuthCredentialProvider, ProviderCredentialState> {
  const state = {} as Record<OAuthCredentialProvider, ProviderCredentialState>;
  for (const p of PROVIDERS) {
    state[p.id] = {
      clientId: '',
      clientSecret: '',
      showSecret: false,
      saving: false,
      configured: false,
      expanded: false,
    };
  }
  return state;
}

// Small icon rendered as coloured text abbreviation since Lucide doesn't
// have provider brand icons. This keeps zero external icon-pack dependencies.
function ProviderIcon({ id }: { id: OAuthCredentialProvider }) {
  const colours: Record<OAuthCredentialProvider, string> = {
    github: 'bg-neutral-700 text-white',
    google: 'bg-blue-600 text-white',
    slack: 'bg-purple-600 text-white',
    notion: 'bg-neutral-900 text-white',
    figma: 'bg-orange-500 text-white',
    microsoft: 'bg-blue-500 text-white',
    atlassian: 'bg-blue-700 text-white',
  };
  const abbrev: Record<OAuthCredentialProvider, string> = {
    github: 'GH',
    google: 'G',
    slack: 'Sl',
    notion: 'N',
    figma: 'Fi',
    microsoft: 'Ms',
    atlassian: 'At',
  };
  return (
    <span
      className={[
        'inline-flex items-center justify-center w-8 h-8 rounded-md text-xs font-bold flex-shrink-0',
        colours[id],
      ].join(' ')}
    >
      {abbrev[id]}
    </span>
  );
}

export function OAuthCredentialsPanel() {
  const [state, setState] =
    useState<Record<OAuthCredentialProvider, ProviderCredentialState>>(makeInitialState);

  // On mount, check which providers already have credentials configured.
  useEffect(() => {
    for (const p of PROVIDERS) {
      invoke<{ configured: boolean }>('mcp_oauth_credentials_status', { provider: p.id })
        .then((result) => {
          setState((prev) => ({
            ...prev,
            [p.id]: { ...prev[p.id], configured: result.configured },
          }));
        })
        .catch(() => {
          // Command may not exist yet — silently ignore and leave configured=false
        });
    }
  }, []);

  const toggleExpand = useCallback((id: OAuthCredentialProvider) => {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], expanded: !prev[id].expanded },
    }));
  }, []);

  const toggleShowSecret = useCallback((id: OAuthCredentialProvider) => {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], showSecret: !prev[id].showSecret },
    }));
  }, []);

  const setField = useCallback(
    (id: OAuthCredentialProvider, field: 'clientId' | 'clientSecret', value: string) => {
      setState((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: value },
      }));
    },
    [],
  );

  const handleSave = useCallback(
    async (id: OAuthCredentialProvider) => {
      const { clientId, clientSecret } = state[id];
      if (!clientId.trim() || !clientSecret.trim()) {
        toast({
          title: 'Both fields required',
          description: 'Enter a Client ID and Client Secret before saving.',
          variant: 'destructive',
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        [id]: { ...prev[id], saving: true },
      }));

      try {
        await invoke('mcp_oauth_set_credentials', {
          provider: id,
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        });
        setState((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            saving: false,
            configured: true,
            expanded: false,
            clientSecret: '', // Clear secret from memory after save
          },
        }));
        toast({
          title: 'Credentials saved',
          description: `${PROVIDERS.find((p) => p.id === id)?.name} credentials stored securely.`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          [id]: { ...prev[id], saving: false },
        }));
        toast({
          title: 'Failed to save credentials',
          description: message,
          variant: 'destructive',
        });
      }
    },
    [state],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">OAuth App Credentials</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Register your own OAuth apps with each provider so the Connectors feature can request
          permissions on behalf of your users. Credentials are stored encrypted via SecretManager.
        </p>

        <div className="space-y-3">
          {PROVIDERS.map((provider) => {
            const ps = state[provider.id];
            return (
              <div
                key={provider.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                {/* Header row — always visible */}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(provider.id)}
                  aria-expanded={ps.expanded}
                >
                  <ProviderIcon id={provider.id} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{provider.name}</span>
                      {ps.configured ? (
                        <Badge
                          variant="outline"
                          className="text-xs text-green-600 border-green-600/40 bg-green-600/10 gap-1"
                        >
                          <Check size={10} />
                          Configured
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Not configured
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{provider.description}</p>
                  </div>
                  {ps.expanded ? (
                    <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
                  )}
                </button>

                {/* Expandable form */}
                {ps.expanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground">
                      Create an OAuth app at{' '}
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground transition-colors"
                      >
                        {provider.docsUrl.replace(/^https?:\/\//, '')}
                      </a>{' '}
                      and paste the credentials below.
                    </p>

                    {/* Client ID */}
                    <div className="space-y-1.5">
                      <Label htmlFor={`${provider.id}-client-id`}>{provider.clientIdLabel}</Label>
                      <input
                        id={`${provider.id}-client-id`}
                        type="text"
                        value={ps.clientId}
                        onChange={(e) => setField(provider.id, 'clientId', e.target.value)}
                        placeholder={`Enter ${provider.clientIdLabel.toLowerCase()}`}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                      />
                    </div>

                    {/* Client Secret */}
                    <div className="space-y-1.5">
                      <Label htmlFor={`${provider.id}-client-secret`}>
                        {provider.clientSecretLabel}
                      </Label>
                      <div className="relative">
                        <input
                          id={`${provider.id}-client-secret`}
                          type={ps.showSecret ? 'text' : 'password'}
                          value={ps.clientSecret}
                          onChange={(e) => setField(provider.id, 'clientSecret', e.target.value)}
                          placeholder={`Enter ${provider.clientSecretLabel.toLowerCase()}`}
                          autoComplete="new-password"
                          spellCheck={false}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowSecret(provider.id)}
                          aria-label={ps.showSecret ? 'Hide secret' : 'Show secret'}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {ps.showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    {/* Save button */}
                    <div className="flex items-center gap-3 pt-1">
                      <Button
                        size="sm"
                        onClick={() => void handleSave(provider.id)}
                        disabled={ps.saving || !ps.clientId.trim() || !ps.clientSecret.trim()}
                        className="gap-2"
                      >
                        {ps.saving ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <KeyRound size={14} />
                            Save Credentials
                          </>
                        )}
                      </Button>
                      {ps.configured && (
                        <span className="text-xs text-muted-foreground">
                          Credentials already on file — saving will overwrite them.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
