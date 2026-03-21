/**
 * ImageInlinePanel Component
 *
 * Displays AI-generated images from the /imagine slash command.
 * Shows a loading spinner while generating, then renders the image(s).
 */

import React, { memo, useState } from 'react';
import { Download, Copy, Check, Loader2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { InlinePanel as InlinePanelType } from '../../../stores/unifiedChatStore';
import { InlinePanel } from './InlinePanel';

export interface ImageInlinePanelProps {
  panel: InlinePanelType;
  onToggleCollapse: () => void;
  messageId?: string;
}

const ImageInlinePanelComponent: React.FC<ImageInlinePanelProps> = memo(
  ({ panel, onToggleCollapse }) => {
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const imageContent = panel.content.image;

    if (!imageContent) {
      return null;
    }

    const handleCopyUrl = async (url: string, index: number) => {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedIndex(index);
        toast.success('Image URL copied to clipboard');
        setTimeout(() => setCopiedIndex(null), 2000);
      } catch {
        toast.error('Failed to copy URL');
      }
    };

    const handleDownload = (url: string, index: number) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `imagine-${Date.now()}-${index + 1}.png`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    };

    return (
      <InlinePanel panel={panel} onToggleCollapse={onToggleCollapse} onClose={() => {}}>
        <div className="space-y-3">
          {/* Prompt */}
          <div>
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Prompt
            </span>
            <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 italic">
              &ldquo;{imageContent.prompt}&rdquo;
            </p>
          </div>

          {/* Status / Content */}
          {imageContent.status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500 dark:text-gray-400">
              <Loader2 size={28} className="animate-spin" />
              <span className="text-sm">Generating image&hellip;</span>
            </div>
          )}

          {imageContent.status === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-red-500">
              <ImageOff size={28} />
              <span className="text-sm">{imageContent.error ?? 'Image generation failed'}</span>
            </div>
          )}

          {imageContent.status === 'success' &&
            imageContent.urls &&
            imageContent.urls.length > 0 && (
              <div className="space-y-3">
                {imageContent.urls.map((url, i) => (
                  <div
                    key={url}
                    className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-charcoal-700"
                  >
                    <img
                      src={url}
                      alt={`Generated: ${imageContent.prompt}`}
                      className="w-full h-auto object-contain max-h-[512px]"
                      loading="lazy"
                    />
                    {/* Hover action bar */}
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-1 p-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(url, i)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                        title="Copy image URL"
                      >
                        {copiedIndex === i ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedIndex === i ? 'Copied' : 'Copy URL'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(url, i)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                        title="Download image"
                      >
                        <Download size={12} />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          {/* Metadata footer */}
          {imageContent.status === 'success' && (
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {imageContent.provider && (
                <span>
                  Provider: <span className="font-medium">{imageContent.provider}</span>
                </span>
              )}
              {imageContent.model && (
                <span>
                  Model: <span className="font-medium">{imageContent.model}</span>
                </span>
              )}
              {imageContent.latencyMs !== undefined && (
                <span>{(imageContent.latencyMs / 1000).toFixed(1)}s</span>
              )}
            </div>
          )}
        </div>
      </InlinePanel>
    );
  },
);

ImageInlinePanelComponent.displayName = 'ImageInlinePanel';

export { ImageInlinePanelComponent as ImageInlinePanel };
