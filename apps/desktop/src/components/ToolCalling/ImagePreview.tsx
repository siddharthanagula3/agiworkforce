/**
 * ImagePreview Component
 *
 * Display screenshots and image results from tool executions.
 * Supports zoom, download, and OCR text extraction display.
 */

import { useState } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2, X, Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { ToolArtifact } from '../../types/toolCalling';

interface ImagePreviewProps {
  artifact: ToolArtifact;
  alt?: string;
  className?: string;
  maxHeight?: string;
  showMetadata?: boolean;
  ocrText?: string; // OCR extracted text
}

export function ImagePreview({
  artifact,
  alt,
  className,
  maxHeight = '400px',
  showMetadata = true,
  ocrText,
}: ImagePreviewProps) {
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get image source (either data URL or regular URL)
  const imageSrc = artifact.data ? `data:${artifact.mime_type ?? 'image/png'};base64,${artifact.data}` : artifact.url;

  if (!imageSrc) {
    return (
      <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
        No image data available
      </div>
    );
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = artifact.name || `image_${Date.now()}.png`;
    link.click();
  };

  const handleCopyOCR = async () => {
    if (!ocrText) return;
    await navigator.clipboard.writeText(ocrText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 300));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 25));
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <>
      <div className={cn('border border-border rounded-lg bg-background overflow-hidden', className)}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Image</span>
            {showMetadata && artifact.name && (
              <span className="text-xs text-muted-foreground">{artifact.name}</span>
            )}
            {showMetadata && artifact.size && (
              <span className="text-xs text-muted-foreground">({formatFileSize(artifact.size)})</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 25}
              className="h-7 px-2"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-12 text-center">{zoom}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 300}
              className="h-7 px-2"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(true)}
              className="h-7 px-2"
              title="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-7 px-2"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Image Container */}
        <div
          className="overflow-auto p-4 flex items-center justify-center bg-muted/20"
          style={{ maxHeight }}
        >
          <img
            src={imageSrc}
            alt={alt || artifact.name || 'Tool output image'}
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center',
              maxWidth: '100%',
              transition: 'transform 0.2s ease',
            }}
            className="rounded shadow-md"
          />
        </div>

        {/* OCR Text (if available) */}
        {ocrText && (
          <div className="border-t border-border p-3 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">Extracted Text (OCR)</span>
              <Button variant="ghost" size="sm" onClick={handleCopyOCR} className="h-6 px-2">
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="text-xs font-mono bg-background/50 rounded p-2 max-h-32 overflow-auto">
              {ocrText}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10"
            onClick={() => setIsFullscreen(false)}
          >
            <X className="h-6 w-6" />
          </Button>
          <img
            src={imageSrc}
            alt={alt || artifact.name || 'Tool output image'}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
