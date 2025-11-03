import { useState } from 'react';
import { X, Eye, Trash2, Copy, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Separator } from '../ui/Separator';
import { OCRViewer } from './OCRViewer';
import { useScreenCapture } from '../../hooks/useScreenCapture';
import type { CaptureResult } from '../../types/capture';
import { toast } from 'sonner';
import { convertFileSrc } from '@tauri-apps/api/core';

interface CapturePreviewProps {
  capture: CaptureResult;
  onClose: () => void;
  onDelete?: () => void;
  showOCR?: boolean;
}

export function CapturePreview({ capture, onClose, onDelete, showOCR = true }: CapturePreviewProps) {
  const [showFullView, setShowFullView] = useState(false);
  const [showOCRViewer, setShowOCRViewer] = useState(false);
  const { saveToClipboard, deleteCapture } = useScreenCapture();
  const [isDeleting, setIsDeleting] = useState(false);

  const imageSrc = convertFileSrc(capture.path);

  const handleCopyToClipboard = async () => {
    try {
      await saveToClipboard(capture.id);
      toast.success('Image copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy image');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this capture?')) return;

    setIsDeleting(true);
    try {
      await deleteCapture(capture.id);
      toast.success('Capture deleted');
      onDelete?.();
      onClose();
    } catch (error) {
      toast.error('Failed to delete capture');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Screen Capture</span>
            <span className="text-xs text-muted-foreground">
              {capture.metadata.width} x {capture.metadata.height}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Image Preview */}
        <div className="relative">
          <img
            src={imageSrc}
            alt="Screen capture"
            className="w-full cursor-pointer object-contain"
            style={{ maxHeight: '300px' }}
            onClick={() => setShowFullView(true)}
          />
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-2 right-2 gap-2"
            onClick={() => setShowFullView(true)}
          >
            <Eye className="h-4 w-4" />
            View Full Size
          </Button>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 p-3">
          <Button variant="outline" size="sm" onClick={handleCopyToClipboard} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy
          </Button>

          {showOCR && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOCRViewer(true)}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              Extract Text
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="ml-auto gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>

        {/* Metadata */}
        <div className="border-t bg-muted/50 p-3 text-xs text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">Type:</span>{' '}
              {capture.captureType.charAt(0).toUpperCase() + capture.captureType.slice(1)}
            </div>
            <div>
              <span className="font-medium">Captured:</span>{' '}
              {new Date(capture.createdAt * 1000).toLocaleString()}
            </div>
          </div>
        </div>
      </Card>

      {/* Full View Dialog */}
      <Dialog open={showFullView} onOpenChange={setShowFullView}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Screen Capture - Full View</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            <img src={imageSrc} alt="Screen capture" className="w-full" />
          </div>
        </DialogContent>
      </Dialog>

      {/* OCR Viewer Dialog */}
      <Dialog open={showOCRViewer} onOpenChange={setShowOCRViewer}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>OCR Text Extraction</DialogTitle>
          </DialogHeader>
          <div className="h-[500px]">
            <OCRViewer
              captureId={capture.id}
              imagePath={capture.path}
              onClose={() => setShowOCRViewer(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
