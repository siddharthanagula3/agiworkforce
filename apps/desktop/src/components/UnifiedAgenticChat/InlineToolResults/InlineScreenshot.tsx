import { Camera, Copy, ChevronUp, Download, ScanText, Maximize2, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';

export interface ScreenshotData {
  imageBase64?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  ocrText?: string;
  ocrConfidence?: number;
  timestamp?: string;
  format?: string;
  success?: boolean;
  error?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export const InlineScreenshot: React.FC<ToolResultProps> = ({ result, status: _status }) => {
  const [showOcr, setShowOcr] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const data = result?.data as ScreenshotData | undefined;
  if (!data) return null;

  const {
    imageBase64,
    imageUrl,
    width,
    height,
    ocrText,
    ocrConfidence,
    timestamp,
    format = 'png',
    success = true,
    error,
    region,
  } = data;

  const imageSrc = imageBase64 ? `data:image/${format};base64,${imageBase64}` : imageUrl;

  // Error state
  if (!success || error || !imageSrc) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <Camera className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">Screenshot failed</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error || 'No image data available'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `screenshot-${timestamp || Date.now()}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Screenshot downloaded', {
      icon: <Download className="h-4 w-4" />,
      duration: 2000,
    });
  };

  const handleCopyOcr = () => {
    if (ocrText) {
      navigator.clipboard.writeText(ocrText);
      toast.success('OCR text copied to clipboard', {
        icon: <Check className="h-4 w-4" />,
        duration: 2000,
      });
    }
  };

  const confidenceColor =
    ocrConfidence !== undefined
      ? ocrConfidence >= 0.9
        ? 'text-emerald-400'
        : ocrConfidence >= 0.7
          ? 'text-amber-400'
          : 'text-red-400'
      : 'text-muted-foreground';

  return (
    <div className="inline-screenshot mt-3 rounded-lg border border-border/50 overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Screenshot</span>
          {width && height && (
            <span className="text-xs text-muted-foreground">
              {width} × {height}
            </span>
          )}
          {region && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              Region
            </Badge>
          )}
          {ocrText && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 flex items-center gap-1">
              <ScanText className="h-3 w-3" />
              OCR
              {ocrConfidence !== undefined && (
                <span className={confidenceColor}>{Math.round(ocrConfidence * 100)}%</span>
              )}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {ocrText && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setShowOcr(!showOcr)}
              className="h-6 px-2 text-xs"
              title="Toggle OCR text"
            >
              <ScanText className="h-3 w-3 mr-1" />
              {showOcr ? 'Hide' : 'Show'} Text
            </Button>
          )}

          <Button
            size="xs"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
            className="h-6 w-6 p-0"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>

          <Button
            size="xs"
            variant="ghost"
            onClick={handleDownload}
            className="h-6 w-6 p-0"
            title="Download screenshot"
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Image Preview */}
      <div className={`relative ${expanded ? '' : 'max-h-48 overflow-hidden'}`}>
        <img
          src={imageSrc}
          alt="Screenshot"
          className={`w-full object-contain ${expanded ? '' : 'max-h-48'}`}
          style={{ backgroundColor: '#1a1a1a' }}
        />
        {!expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-surface-elevated to-transparent pointer-events-none" />
        )}
      </div>

      {/* OCR Text */}
      {showOcr && ocrText && (
        <div className="p-3 border-t border-border/30 bg-surface-base/50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <ScanText className="h-3.5 w-3.5" />
              Extracted Text
              {ocrConfidence !== undefined && (
                <span className={`${confidenceColor}`}>
                  ({Math.round(ocrConfidence * 100)}% confidence)
                </span>
              )}
            </div>
            <Button
              size="xs"
              variant="ghost"
              onClick={handleCopyOcr}
              className="h-6 w-6 p-0"
              title="Copy OCR text"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <pre className="text-xs font-mono text-foreground bg-surface-base rounded p-2 overflow-auto whitespace-pre-wrap max-h-48">
            {ocrText}
          </pre>
        </div>
      )}

      {/* Metadata (expanded) */}
      {expanded && (
        <div className="px-3 py-2 border-t border-border/30 bg-surface-base/30 flex items-center gap-4 text-xs text-muted-foreground">
          {timestamp && <span>Captured: {new Date(timestamp).toLocaleString()}</span>}
          {region && (
            <span>
              Region: ({region.x}, {region.y}) - {region.width}×{region.height}
            </span>
          )}
          <span className="uppercase">{format}</span>
        </div>
      )}
    </div>
  );
};
