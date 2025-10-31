import { useState } from 'react';
import { File, FileText, Image as ImageIcon, Download, X, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { cn } from '../../lib/utils';
import {
  formatFileSize,
  isImageFile,
  isCodeFile,
  isDocumentFile,
  getFileTypeDescription,
} from '../../utils/fileUtils';
import type { FileAttachment } from '../../types/chat';

interface FileAttachmentPreviewProps {
  attachment: FileAttachment;
  onRemove?: () => void;
  removable?: boolean;
  className?: string;
}

export function FileAttachmentPreview({
  attachment,
  onRemove,
  removable = false,
  className,
}: FileAttachmentPreviewProps) {
  const [imageError, setImageError] = useState(false);

  const handleDownload = () => {
    if (attachment.url) {
      window.open(attachment.url, '_blank');
    } else if (attachment.data) {
      const a = document.createElement('a');
      a.href = attachment.data;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const getFileIcon = () => {
    if (isImageFile(attachment.type)) {
      return <ImageIcon className="h-5 w-5" />;
    }
    if (isCodeFile(attachment.type) || isDocumentFile(attachment.type)) {
      return <FileText className="h-5 w-5" />;
    }
    return <File className="h-5 w-5" />;
  };

  const hasError = Boolean(attachment.error);
  const isUploading = attachment.uploadProgress !== undefined && attachment.uploadProgress < 100;
  const canDisplay = isImageFile(attachment.type) && (attachment.data || attachment.url);

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all',
        hasError && 'border-destructive',
        className
      )}
    >
      <CardContent className="p-0">
        {canDisplay && !imageError ? (
          <div className="relative group">
            <img
              src={attachment.data || attachment.url}
              alt={attachment.name}
              className="w-full h-48 object-cover"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors">
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={handleDownload}
                      aria-label="Download attachment"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download</p>
                  </TooltipContent>
                </Tooltip>
                {removable && onRemove && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={onRemove}
                        aria-label="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            {isUploading && (
              <>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${attachment.uploadProgress}%` }}
                  />
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                  Uploading... {attachment.uploadProgress}%
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                hasError ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
              )}>
                {hasError ? <AlertCircle className="h-5 w-5" /> : getFileIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium truncate">
                    {attachment.name}
                  </p>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {getFileTypeDescription(attachment.type)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </p>
                {hasError && (
                  <p className="text-xs text-destructive mt-1">
                    {attachment.error}
                  </p>
                )}
                {isUploading && (
                  <div className="mt-2">
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${attachment.uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Uploading... {attachment.uploadProgress}%
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!hasError && !isUploading && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleDownload}
                        aria-label="Download attachment"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {removable && onRemove && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onRemove}
                        aria-label="Remove attachment"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Remove</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
