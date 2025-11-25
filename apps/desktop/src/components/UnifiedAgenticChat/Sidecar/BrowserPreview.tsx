import { invoke } from '@/lib/tauri-mock';
import { motion } from 'framer-motion';
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    ExternalLink,
    Globe,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useBrowserStore } from '../../../stores/browserStore';
import { BrowserViewer } from '../../Browser/BrowserViewer';

interface BrowserPreviewProps {
  contextId?: string;
  className?: string;
}

export function BrowserPreview({ contextId, className }: BrowserPreviewProps) {
  const [url, setUrl] = useState<string>('');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { activeSessionId, sessions } = useBrowserStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeTab = activeSession?.tabs.find((t) => t.active);
  const tabId = activeTab?.id;

  // Load URL from contextId
  useEffect(() => {
    if (contextId) {
      // Check if contextId is a URL
      try {
        const parsedUrl = new URL(contextId);
        setUrl(parsedUrl.toString());
        setInputUrl(parsedUrl.toString());
      } catch {
        // If not a valid URL, treat as search query
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(contextId)}`;
        setUrl(searchUrl);
        setInputUrl(searchUrl);
      }
    }
  }, [contextId]);

  // Browser navigation handlers
  const handleGoBack = useCallback(async () => {
    if (!tabId) return;
    try {
      setIsLoading(true);
      setError(null);
      await invoke('browser_go_back', { tabId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to go back');
    } finally {
      setIsLoading(false);
    }
  }, [tabId]);

  const handleGoForward = useCallback(async () => {
    if (!tabId) return;
    try {
      setIsLoading(true);
      setError(null);
      await invoke('browser_go_forward', { tabId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to go forward');
    } finally {
      setIsLoading(false);
    }
  }, [tabId]);

  // Navigate to URL
  const handleNavigate = useCallback(
    async (targetUrl: string) => {
      if (!tabId) {
        setError('No active browser tab');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Ensure URL has protocol
        let finalUrl = targetUrl.trim();
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
          finalUrl = `https://${finalUrl}`;
        }

        await invoke('browser_navigate', {
          tabId,
          url: finalUrl,
        });

        setUrl(finalUrl);
        setInputUrl(finalUrl);
      } catch (err) {
        setError(`Navigation failed: ${err}`);
      } finally {
        setIsLoading(false);
      }
    },
    [tabId],
  );

  // Refresh current page
  const handleRefresh = useCallback(async () => {
    if (!tabId) return;

    setIsLoading(true);
    setError(null);

    try {
      await invoke('browser_reload', { tabId });
    } catch (err) {
      setError(`Reload failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [tabId]);

  // Handle URL input submission
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (inputUrl.trim()) {
        handleNavigate(inputUrl.trim());
      }
    },
    [inputUrl, handleNavigate],
  );

  // Open in external browser
  const handleOpenExternal = useCallback(() => {
    if (url) {
      window.open(url, '_blank');
    }
  }, [url]);

  return (
    <div className={cn('flex h-full flex-col bg-zinc-950', className)}>
      {/* Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        {/* Back/Forward buttons */}
        <button
          onClick={handleGoBack}
          disabled={!tabId || isLoading}
          className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
          title="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={handleGoForward}
          disabled={!tabId || isLoading}
          className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
          title="Go forward"
        >
          <ArrowRight className="h-4 w-4" />
        </button>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={isLoading || !tabId}
          className={cn(
            'rounded-lg p-2 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-200',
            'disabled:cursor-not-allowed disabled:opacity-30',
            isLoading && 'animate-spin',
          )}
          title="Refresh page"
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        {/* URL Input */}
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Enter URL or search..."
              disabled={!tabId}
              className={cn(
                'w-full rounded-lg border border-zinc-700 bg-zinc-800 px-10 py-2 text-sm text-zinc-100',
                'placeholder:text-zinc-500',
                'focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal" />
            )}
          </div>
        </form>

        {/* Open in external browser */}
        <button
          onClick={handleOpenExternal}
          disabled={!url}
          className={cn(
            'rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200',
            'disabled:cursor-not-allowed disabled:opacity-30',
          )}
          title="Open in external browser"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-b border-rose-500/20 bg-rose-900/20 px-4 py-2"
        >
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span className="text-rose-300">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-xs text-rose-400 hover:text-rose-300"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}

      {/* Browser View */}
      <div className="flex-1 overflow-hidden">
        {tabId ? (
          <BrowserViewer tabId={tabId} className="h-full" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Globe className="mx-auto h-12 w-12 text-zinc-600" />
              <p className="mt-4 text-sm text-zinc-400">No active browser session</p>
              <p className="mt-1 text-xs text-zinc-500">
                Start a browser automation task to view content
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {isLoading && tabId && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl bg-zinc-900 px-6 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-teal" />
            <span className="text-sm font-medium text-zinc-200">Loading page...</span>
          </div>
        </div>
      )}
    </div>
  );
}
