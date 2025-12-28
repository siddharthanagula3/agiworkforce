import { invoke } from '@/lib/tauri-mock';
import { AlertCircle, Check, Eye, EyeOff, Github, Loader2, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../ui/Button';

export const GitHubTokenConfig: React.FC = () => {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenSet, setTokenSet] = useState(false);
  const [validationStatus, setValidationStatus] = useState<
    'idle' | 'validating' | 'valid' | 'invalid'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleValidateToken = async () => {
    if (!token.trim()) {
      setErrorMessage('Please enter a GitHub token');
      setValidationStatus('invalid');
      return;
    }

    setLoading(true);
    setValidationStatus('validating');
    setErrorMessage('');

    try {
      // Validate token against GitHub API
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error('Invalid token: Unable to authenticate with GitHub');
      }

      const userData = (await response.json()) as { login?: string };

      // Store token in OS keyring via Tauri
      await invoke('mcp_set_credential', {
        service: 'github',
        account: 'github_pat',
        password: token,
      });

      setValidationStatus('valid');
      setSuccessMessage(`Successfully authenticated as ${userData.login}`);
      setTokenSet(true);
      setToken('');

      // Clear messages after 5 seconds
      setTimeout(() => {
        setSuccessMessage('');
        setValidationStatus('idle');
      }, 5000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to validate token';
      setErrorMessage(errorMsg);
      setValidationStatus('invalid');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveToken = async () => {
    setLoading(true);
    try {
      await invoke('mcp_delete_credential', {
        service: 'github',
        account: 'github_pat',
      });

      setTokenSet(false);
      setToken('');
      setValidationStatus('idle');
      setSuccessMessage('GitHub token removed');

      setTimeout(() => {
        setSuccessMessage('');
      }, 5000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to remove token';
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-surface-elevated p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5 text-gray-400" />
            <h3 className="font-medium text-foreground">GitHub Integration</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your GitHub Personal Access Token for MCP tools. Token is securely stored in
            your OS keyring.
          </p>
        </div>
      </div>

      {/* Required Scopes Info */}
      <div className="rounded-lg bg-blue-500/5 p-3 text-sm text-blue-300">
        <div className="font-medium">Required GitHub Token Scopes:</div>
        <ul className="mt-2 space-y-1 ml-2">
          <li>• repo - Full control of private repositories</li>
          <li>• read:user - Read user profile data</li>
          <li>• read:org - Read organization data</li>
        </ul>
        <a
          href="https://github.com/settings/tokens/new?scopes=repo,read:user,read:org"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition"
        >
          Create Token on GitHub →
        </a>
      </div>

      {/* Token Input Section */}
      {!tokenSet ? (
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setErrorMessage('');
                if (validationStatus !== 'idle') {
                  setValidationStatus('idle');
                }
              }}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-border bg-background px-4 py-2 pr-10 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition"
            >
              {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Error State */}
          {validationStatus === 'invalid' && errorMessage && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-3">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-300">{errorMessage}</p>
            </div>
          )}

          {/* Valid State */}
          {validationStatus === 'valid' && successMessage && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3">
              <Check className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-emerald-300">{successMessage}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleValidateToken}
              disabled={loading || !token.trim() || validationStatus === 'validating'}
              variant="default"
              className="flex-1"
            >
              {validationStatus === 'validating' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : validationStatus === 'valid' ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Save Token
                </>
              ) : (
                'Validate & Save Token'
              )}
            </Button>
          </div>
        </div>
      ) : (
        /* Token Set State */
        <div className="rounded-lg bg-emerald-500/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-400" />
              <span className="font-medium text-emerald-300">GitHub token is configured</span>
            </div>
            <Button
              onClick={handleRemoveToken}
              disabled={loading}
              variant="outline"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:border-red-400/50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </>
              )}
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your token is securely stored in your system keyring and will be used for GitHub MCP
            operations.
          </p>
        </div>
      )}

      {/* Success Message (for removal) */}
      {successMessage && tokenSet === false && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3">
          <Check className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-emerald-300">{successMessage}</p>
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          • Tokens are stored locally in your system keyring (Keychain on macOS, Credential Manager
          on Windows, Secret Service on Linux)
        </p>
        <p>• GitHub tools will become available after token validation</p>
        <p>
          • You can manage your tokens at{' '}
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            github.com/settings/tokens
          </a>
        </p>
      </div>
    </div>
  );
};

export default GitHubTokenConfig;
