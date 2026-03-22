import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import { McpClient } from '@/api/mcp';
import { toast } from 'sonner';
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

// Official brand SVG logos — inline to avoid external icon-pack dependencies.
function ProviderIcon({ id }: { id: OAuthCredentialProvider }) {
  const icons: Record<OAuthCredentialProvider, React.ReactNode> = {
    github: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
    google: (
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
    slack: (
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path
          fill="#E01E5A"
          d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
        />
        <path
          fill="#36C5F0"
          d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
        />
        <path
          fill="#2EB67D"
          d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
        />
        <path
          fill="#ECB22E"
          d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"
        />
      </svg>
    ),
    notion: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.39 2.33c-.42-.326-.98-.7-2.055-.607L3.01 2.87c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933zM2.877 1.56l13.728-.933c1.682-.14 2.1 0 2.8.514l3.875 2.707c.467.327.607.746.607 1.26v16.06c0 1.026-.373 1.632-1.682 1.726l-15.458.933c-.98.047-1.448-.093-1.962-.747L1.43 18.927c-.56-.747-.793-1.306-.793-1.96V2.96c0-.838.374-1.54 1.355-1.633z" />
      </svg>
    ),
    figma: (
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path
          fill="#F24E1E"
          d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491z"
        />
        <path
          fill="#A259FF"
          d="M6.77 24c2.476 0 4.49-2.014 4.49-4.49v-4.49H6.77c-2.476 0-4.49 2.014-4.49 4.49S4.294 24 6.77 24z"
        />
        <path
          fill="#FF7262"
          d="M6.77 8.981h4.49V0H6.77c-2.476 0-4.49 2.014-4.49 4.49s2.014 4.491 4.49 4.491z"
        />
        <path
          fill="#0ACF83"
          d="M6.77 17.962h4.49v-8.981H6.77c-2.476 0-4.49 2.014-4.49 4.49s2.014 4.491 4.49 4.491z"
        />
        <path
          fill="#1ABCFE"
          d="M15.852 17.962c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491h-4.588v8.981h4.588z"
        />
      </svg>
    ),
    microsoft: (
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
      </svg>
    ),
    atlassian: (
      <svg viewBox="0 0 24 24" className="w-5 h-5">
        <path
          fill="#2684FF"
          d="M7.127 19.56c-.347-.39-.058-.976.46-.976h4.863c.196 0 .376.1.48.264l4.943 8.652c.19.33-.01.744-.384.744H12.48a.575.575 0 0 1-.503-.296L7.127 19.56z"
          transform="translate(0 -4)"
        />
        <path
          fill="#2684FF"
          d="M11.07 8.66a12.66 12.66 0 0 0-.292 12.56l3.82 7.28c.19.33.543.5.885.5h5.01c.374 0 .573-.414.384-.744C20.877 28.262 14.236 15.89 11.07 8.66z"
          transform="translate(0 -4)"
          opacity=".8"
        />
      </svg>
    ),
  };

  const bgColors: Record<OAuthCredentialProvider, string> = {
    github: 'bg-neutral-800',
    google: 'bg-white',
    slack: 'bg-[#1a1a2e]',
    notion: 'bg-neutral-900',
    figma: 'bg-neutral-900',
    microsoft: 'bg-neutral-900',
    atlassian: 'bg-white',
  };

  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ${bgColors[id]}`}
    >
      {icons[id]}
    </span>
  );
}

export function OAuthCredentialsPanel() {
  const [state, setState] =
    useState<Record<OAuthCredentialProvider, ProviderCredentialState>>(makeInitialState);

  // On mount, check which providers already have credentials configured.
  useEffect(() => {
    for (const p of PROVIDERS) {
      McpClient.oauthCredentialsStatus(p.id)
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
        toast.error('Both fields required', {
          description: 'Enter a Client ID and Client Secret before saving.',
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        [id]: { ...prev[id], saving: true },
      }));

      try {
        await McpClient.oauthSetCredentialsRaw(id, clientId.trim(), clientSecret.trim());
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
        toast.success('Credentials saved', {
          description: `${PROVIDERS.find((p) => p.id === id)?.name} credentials stored securely.`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          [id]: { ...prev[id], saving: false },
        }));
        toast.error('Failed to save credentials', {
          description: message,
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
                className="rounded-lg border border-border bg-[#242424] overflow-hidden"
              >
                {/* Header row — always visible */}
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#383838] transition-colors"
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
                        className="w-full rounded-md border border-input bg-[#1c1c1c] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
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
                          className="w-full rounded-md border border-input bg-[#1c1c1c] px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
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
