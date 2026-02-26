/**
 * BrowserInlinePanel Component
 *
 * Displays browser automation results including screenshots, URL, page title,
 * and action history.
 */

import React, { memo, useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { InlinePanel as InlinePanelType } from '@/stores/unified/unifiedChatStore';
import { InlinePanel } from './InlinePanel';

export interface BrowserInlinePanelProps {
  panel: InlinePanelType;
  onToggleCollapse: () => void;
  messageId?: string;
}

const BrowserInlinePanelComponent: React.FC<BrowserInlinePanelProps> = memo(
  ({ panel, onToggleCollapse }) => {
    const [copied, setCopied] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);
    const browserContent = panel.content.browser;

    if (!browserContent) {
      return null;
    }

    const handleCopyUrl = () => {
      navigator.clipboard.writeText(browserContent.url);
      setCopied(true);
      toast.success('URL copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    };

    const handleOpenInBrowser = () => {
      window.open(browserContent.url, '_blank');
    };

    return (
      <InlinePanel panel={panel} onToggleCollapse={onToggleCollapse} onClose={() => {}}>
        <div className="space-y-3">
          {/* URL and Title */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Page Info
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-charcoal-700 transition-colors text-gray-600 dark:text-gray-400"
                  title="Copy URL"
                >
                  {copied ? (
                    <>
                      <Check size={12} />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                    </>
                  )}
                </button>
                <button
                  onClick={handleOpenInBrowser}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-charcoal-700 transition-colors text-gray-600 dark:text-gray-400"
                  title="Open in browser"
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>

            {/* URL */}
            <div className="bg-gray-100 dark:bg-charcoal-700 rounded p-2 mb-2 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                {browserContent.url}
              </div>
            </div>

            {/* Title */}
            {browserContent.title && (
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Title:</span>
                {browserContent.title}
              </div>
            )}
          </div>

          {/* Screenshot or Loading State */}
          {browserContent.screenshot ? (
            <div>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block mb-2">
                Screenshot
              </span>
              <div className="relative bg-gray-900 rounded border border-gray-700 overflow-hidden">
                {imageLoading && (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <div className="animate-spin">
                      <div className="w-6 h-6 border-2 border-gray-400 border-t-gray-200 rounded-full" />
                    </div>
                  </div>
                )}
                <img
                  src={`data:image/png;base64,${browserContent.screenshot}`}
                  alt="Browser screenshot"
                  className="w-full h-auto max-h-96 object-contain"
                  onLoad={() => setImageLoading(false)}
                  onError={() => setImageLoading(false)}
                />
              </div>
            </div>
          ) : browserContent.status === 'loading' ? (
            <div className="flex items-center justify-center py-8 bg-gray-100 dark:bg-charcoal-700 rounded border border-gray-200 dark:border-gray-700">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin">
                  <div className="w-6 h-6 border-2 border-gray-400 border-t-primary rounded-full" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Loading page...</span>
              </div>
            </div>
          ) : browserContent.status === 'error' ? (
            <div className="flex items-center justify-center py-8 bg-red-100 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <div className="text-sm text-red-700 dark:text-red-300">
                Failed to capture screenshot
              </div>
            </div>
          ) : null}

          {/* Actions History */}
          {browserContent.actions && browserContent.actions.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block mb-2">
                Actions
              </span>
              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                {browserContent.actions.slice(-5).map((action, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                    <span>
                      {action.type} •{' '}
                      {new Date(action.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </InlinePanel>
    );
  },
);

BrowserInlinePanelComponent.displayName = 'BrowserInlinePanel';

export { BrowserInlinePanelComponent as BrowserInlinePanel };
