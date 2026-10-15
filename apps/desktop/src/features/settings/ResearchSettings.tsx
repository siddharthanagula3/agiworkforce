import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, AlertCircle, Search } from 'lucide-react';
import { useConfirmAction } from '@agiworkforce/ui';
import { invoke } from '@/lib/tauri-mock';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { Spinner } from '@/ui/Spinner';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const PERPLEXITY_KEY = 'perplexity_api_key';

export function ResearchSettings() {
  const [keySet, setKeySet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<SaveStatus>('idle');
  const [keyError, setKeyError] = useState('');
  const keyStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm, dialog } = useConfirmAction();

  useEffect(() => {
    return () => {
      if (keyStatusTimerRef.current) clearTimeout(keyStatusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    invoke<boolean>('secret_manager_has', { key: PERPLEXITY_KEY })
      .then((has) => {
        if (mounted) setKeySet(has === true);
      })
      .catch((err) => {
        if (mounted) setLoadError(getSimpleErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveKey = useCallback(async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setKeyStatus('saving');
    setKeyError('');
    try {
      await invoke('secret_manager_set', { key: PERPLEXITY_KEY, value: trimmed });
      setKeyInput('');
      setKeyStatus('saved');
      setKeySet(true);
      if (keyStatusTimerRef.current) clearTimeout(keyStatusTimerRef.current);
      keyStatusTimerRef.current = setTimeout(() => setKeyStatus('idle'), 2500);
    } catch (err) {
      setKeyStatus('error');
      setKeyError(getSimpleErrorMessage(err));
    }
  }, [keyInput]);

  const removeKey = useCallback(async () => {
    setKeyStatus('saving');
    setKeyError('');
    try {
      await invoke('secret_manager_delete', { key: PERPLEXITY_KEY });
      setKeyStatus('idle');
      setKeySet(false);
    } catch (err) {
      setKeyStatus('error');
      setKeyError(getSimpleErrorMessage(err));
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner size="sm" />
        <span>Loading web search settings…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Failed to load web search settings: {loadError}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Search className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-h3">Web search</h3>
          <p className="text-sm text-muted-foreground">
            The search provider the agent uses when it looks something up on the web
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h4 className="text-sm font-semibold mb-0.5">Perplexity API Key</h4>
          <p className="text-xs text-muted-foreground">
            With a key, web searches the agent runs in chat and in Tasks go to Perplexity under your
            account. Without one they use DuckDuckGo. Deep Research does not use this key. The key
            is stored encrypted on this device.
          </p>
        </div>

        {keySet ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-success-text">
              <Check className="h-4 w-4" />
              <span className="font-medium">API key is saved</span>
            </div>
            <button
              type="button"
              onClick={() =>
                confirm({
                  title: 'Remove the Perplexity key?',
                  description:
                    'Web searches in chat and in Tasks go back to DuckDuckGo. The key is deleted from this device and cannot be shown again, so you will need to paste it in again to use Perplexity.',
                  confirmLabel: 'Remove key',
                  destructive: true,
                  onConfirm: removeKey,
                })
              }
              disabled={keyStatus === 'saving'}
              className="text-xs text-destructive underline hover:no-underline disabled:opacity-50"
            >
              Remove key
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveKey();
                }}
                placeholder="pplx-…"
                aria-label="Perplexity API key"
                autoComplete="off"
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => void handleSaveKey()}
                disabled={!keyInput.trim() || keyStatus === 'saving'}
                className="shrink-0 h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {keyStatus === 'saving' ? <Spinner size="sm" /> : 'Save'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{' '}
              <a
                href="https://www.perplexity.ai/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                perplexity.ai/settings/api
              </a>
            </p>
          </div>
        )}
        {keyError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {keyError}
          </p>
        )}
      </div>
      {dialog}
    </div>
  );
}
