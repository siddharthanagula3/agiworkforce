
import React from 'react';
import { Lock, Paperclip, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Attachment } from '../../stores/unifiedChatStore';
import { AudioPreview } from './AudioPreview';

export interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  className?: string;
  visionSupported?: boolean;
  disableRemove?: boolean;
  privacyShortLabel?: string;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachments,
  onRemove,
  className,
  visionSupported = true,
  disableRemove = false,
  privacyShortLabel,
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
                  {privacyShortLabel ? (
                    <div
                      className="absolute -bottom-1 left-1 z-10 flex items-center gap-0.5 rounded-full border border-border bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground shadow-sm"
                      aria-label={`Outbound destination: ${privacyShortLabel}`}
                    >
                      <Lock className="h-2.5 w-2.5" />
                      {privacyShortLabel}
                    </div>
                  ) : null}
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
                  {privacyShortLabel ? (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                      aria-label={`Outbound destination: ${privacyShortLabel}`}
                    >
                      <Lock className="h-2.5 w-2.5" />
                      {privacyShortLabel}
                    </span>
                  ) : null}
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
