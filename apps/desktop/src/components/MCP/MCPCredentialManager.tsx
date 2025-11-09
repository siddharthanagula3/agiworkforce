import { useState } from 'react';
import { useMcpStore } from '../../stores/mcpStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Alert, AlertDescription } from '../ui/Alert';
import { Key, Eye, EyeOff, Save, AlertCircle } from 'lucide-react';
import type { McpServerInfo } from '../../types/mcp';

interface MCPCredentialManagerProps {
  servers: McpServerInfo[];
}

// Common credential configurations for known servers
const CREDENTIAL_CONFIGS: Record<
  string,
  Array<{ key: string; label: string; placeholder: string }>
> = {
  github: [
    {
      key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
      label: 'GitHub Personal Access Token',
      placeholder: 'ghp_...',
    },
  ],
  'google-drive': [
    {
      key: 'GOOGLE_DRIVE_CLIENT_ID',
      label: 'Google Drive Client ID',
      placeholder: 'xxx.apps.googleusercontent.com',
    },
    {
      key: 'GOOGLE_DRIVE_CLIENT_SECRET',
      label: 'Google Drive Client Secret',
      placeholder: 'GOCSPX-...',
    },
  ],
  slack: [
    {
      key: 'SLACK_BOT_TOKEN',
      label: 'Slack Bot Token',
      placeholder: 'xoxb-...',
    },
  ],
  'brave-search': [
    {
      key: 'BRAVE_API_KEY',
      label: 'Brave Search API Key',
      placeholder: 'BSA...',
    },
  ],
};

export default function MCPCredentialManager({ servers }: MCPCredentialManagerProps) {
  const { storeCredential } = useMcpStore();
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [success, setSuccess] = useState<Record<string, boolean>>({});

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

  // Filter servers that need credentials
  const serversNeedingCredentials = servers.filter((server) => CREDENTIAL_CONFIGS[server.name]);

  if (serversNeedingCredentials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Key className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No credentials required</h3>
        <p className="text-sm text-muted-foreground">
          The configured servers don't require API keys
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          Credentials are stored securely in Windows Credential Manager and never sent to external
          services except the MCP servers you configure.
        </AlertDescription>
      </Alert>

      {serversNeedingCredentials.map((server) => {
        const credentialFields = CREDENTIAL_CONFIGS[server.name] || [];

        return (
          <Card key={server.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{server.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Configure API credentials for this server
                  </CardDescription>
                </div>
                <div
                  className={`w-2 h-2 rounded-full ${server.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                />
              </div>
            </CardHeader>
            <CardContent>
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
                            'Saving...'
                          ) : isSuccess ? (
                            'Saved!'
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Stored securely in Windows Credential Manager
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
  );
}
