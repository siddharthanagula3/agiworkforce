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
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachments,
  onRemove,
  className,
}) => {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={cn('border-b border-gray-100 dark:border-gray-700/50 px-4 py-3', className)}>
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
                onRemove={() => onRemove(attachment.id)}
                compact
              />
            );
          }

          return (
            <div
              key={attachment.id}
              className={cn(
                'group relative inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-charcoal-700 text-sm overflow-hidden',
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
                </div>
              ) : (
                <>
                  <Paperclip size={16} className="text-gray-400" />
                  <span className="truncate max-w-[150px] text-gray-700 dark:text-gray-300">
                    {attachment.name}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => onRemove(attachment.id)}
                className={cn(
                  'transition',
                  isImage
                    ? 'absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100'
                    : 'text-gray-400 hover:text-gray-600',
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
