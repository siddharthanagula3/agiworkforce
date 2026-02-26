/**
 * MessageAttachments Component
 *
 * Renders message attachments including images, videos, audio, and files.
 */

import React, { memo } from 'react';
import { FileText } from 'lucide-react';
import { Attachment } from '@/stores/unified/chat/types';
import { LightboxImage } from './types';

export interface MessageAttachmentsProps {
  attachments: Attachment[];
  onImageClick: (image: LightboxImage) => void;
}

const MessageAttachmentsComponent: React.FC<MessageAttachmentsProps> = ({
  attachments,
  onImageClick,
}) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType?.startsWith('image/');
        const isVideo = attachment.mimeType?.startsWith('video/');
        const isAudio = attachment.mimeType?.startsWith('audio/');
        const mediaSource = attachment.content || attachment.path;

        return (
          <div key={attachment.id} className="attachment-preview max-w-md">
            {isImage && mediaSource ? (
              <button
                type="button"
                onClick={() => onImageClick({ src: mediaSource, alt: attachment.name })}
                className="group/img relative cursor-zoom-in"
              >
                <img
                  src={mediaSource}
                  alt={attachment.name}
                  className="rounded-lg max-h-64 object-contain transition-transform hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 rounded-lg transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover/img:opacity-100 transition-opacity text-white text-xs bg-black/50 px-2 py-1 rounded-full">
                    Click to expand
                  </span>
                </div>
              </button>
            ) : isVideo && mediaSource ? (
              <video
                src={mediaSource}
                controls
                className="rounded-lg max-h-64 w-full"
                preload="metadata"
              >
                <track kind="captions" />
                Your browser does not support video playback.
              </video>
            ) : isAudio && mediaSource ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                <audio src={mediaSource} controls className="w-full max-w-xs">
                  Your browser does not support audio playback.
                </audio>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                <FileText className="h-5 w-5 text-zinc-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {attachment.name}
                  </div>
                  {attachment.size && (
                    <div className="text-xs text-zinc-500 message-meta">
                      {(attachment.size / 1024).toFixed(1)} KB
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

MessageAttachmentsComponent.displayName = 'MessageAttachments';

export const MessageAttachments = memo(MessageAttachmentsComponent);
