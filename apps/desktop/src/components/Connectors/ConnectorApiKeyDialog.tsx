import { Eye, EyeOff, ExternalLink, Lock } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import type { ConnectorDef } from './connectorDefinitions';

interface ConnectorApiKeyDialogProps {
  connector: ConnectorDef | null;
  open: boolean;
  onClose: () => void;
  onConnect: (connector: ConnectorDef, apiKey: string) => void;
}

export function ConnectorApiKeyDialog({
  connector,
  open,
  onClose,
  onConnect,
}: ConnectorApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  if (!connector || !open) return null;

  const handleConnect = () => {
    if (!apiKey.trim()) return;
    onConnect(connector, apiKey.trim());
    setApiKey('');
    setShowKey(false);
  };

  const handleClose = () => {
    setApiKey('');
    setShowKey(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl" role="img" aria-label={connector.name}>
              {connector.icon}
            </span>
            Connect to {connector.name}
          </DialogTitle>
          <DialogDescription>Enter your {connector.name} API key to connect.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* API key input */}
          <div className="space-y-2">
            <label htmlFor="api-key-input" className="text-xs font-medium text-muted-foreground">
              API Key
            </label>
            <div className="relative">
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={connector.apiKeyPlaceholder ?? 'Enter API key...'}
                className="w-full px-3 py-2 pr-10 text-sm rounded-md border border-border bg-[#222222]
                  placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConnect();
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-[#222222] rounded-md px-3 py-2">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Your API key is encrypted and stored securely on your device.</span>
          </div>

          {/* Docs link */}
          {connector.docsUrl && (
            <a
              href={connector.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-teal-500 hover:text-teal-400 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Get API key
            </a>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium rounded-md border border-border
              hover:bg-[#383838] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={!apiKey.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-teal-600 hover:bg-teal-500
              text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
