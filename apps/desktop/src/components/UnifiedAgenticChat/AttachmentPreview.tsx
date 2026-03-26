/**
 * AttachmentPreview Component
 *
 * Displays attachment previews with support for images, audio, and generic files.
 * Includes remove functionality and handles different attachment types appropriately.
 */

import React from 'react';
import { Paperclip, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Attachment } from '../../stores/unifiedChatStore';
import { AudioPreview } from './AudioPreview';

export interface AttachmentPreviewProps {
  /** List of attachments to display */
  attachments: Attachment[];
  /** Callback when an attachment is removed */
  onRemove: (id: string) => void;
  /** Optional className for the container */
  className?: string;
  /** Whether the current model supports vision/images */
  visionSupported?: boolean;
  /** Disable remove controls */
  disableRemove?: boolean;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachments,
  onRemove,
  className,
  visionSupported = true,
  disableRemove = false,
}) => {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={cn('border-b border-border px-4 py-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {attachments.map((attachment) => {
          const isImage = attachment.type === 'image' || attachment.type === 'screenshot';
          const isAudio = attachment.type === 'audio' || attachment.mimeType?.startsWith('audio/');
          const imageUrl = attachment.content || attachment.path;
          const audioUrl = attachment.content || attachment.path;

          // Render audio preview with playback controls
          if (isAudio && audioUrl) {
            return (
              <AudioPreview
                key={attachment.id}
                src={audioUrl}
                name={attachment.name}
                duration={attachment.duration}
                onRemove={disableRemove ? undefined : () => onRemove(attachment.id)}
                compact
              />
            );
          }

          return (
            <div
              key={attachment.id}
              className={cn(
                'group relative inline-flex items-center gap-2 rounded-lg border border-border bg-muted text-sm overflow-hidden',
                isImage ? 'p-1' : 'px-3 py-2',
              )}
            >
              {isImage && imageUrl ? (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt={attachment.name}
                    className="h-16 w-16 object-cover rounded-md"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-md" />
                  {!visionSupported && (
                    <div
                      className="absolute bottom-0 left-0 right-0 flex items-center justify-center rounded-b-md bg-amber-500/90 px-1 py-0.5"
                      title="Model can't process images"
                    >
                      <span className="text-[10px] font-medium leading-none text-black">
                        No vision
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Paperclip size={16} className="text-muted-foreground" />
                  <span className="truncate max-w-[150px] text-foreground">{attachment.name}</span>
                </>
              )}
              <button
                type="button"
                disabled={disableRemove}
                onClick={() => onRemove(attachment.id)}
                className={cn(
                  'transition',
                  isImage
                    ? 'absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100'
                    : 'text-muted-foreground hover:text-foreground',
                  disableRemove && 'cursor-not-allowed opacity-40',
                )}
                aria-label={`Remove ${attachment.name}`}
              >
                <X size={isImage ? 12 : 14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AttachmentPreview;
