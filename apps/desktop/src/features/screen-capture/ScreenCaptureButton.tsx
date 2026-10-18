import { useState } from 'react';
import { Camera, Image } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/Tooltip';
import { RegionSelector } from './RegionSelector';
import { WindowSelector } from './WindowSelector';
import { useScreenCapture } from '../../hooks/useScreenCapture';
import type { Region, CaptureResult, WindowInfo } from '../../types/capture';
import { toast } from 'sonner';
import { getSimpleErrorMessage } from '../../lib/errorMessages';

interface ScreenCaptureButtonProps {
  onCaptureComplete?: (result: CaptureResult) => void;
  className?: string;
}

export function ScreenCaptureButton({ onCaptureComplete, className }: ScreenCaptureButtonProps) {
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const [showWindowSelector, setShowWindowSelector] = useState(false);
  const { captureRegion, captureWindow, getAvailableWindows, isCapturing } = useScreenCapture();

  const handleWindowCapture = async () => {
    try {
      const windows = await getAvailableWindows();
      if (windows.length === 0) {
        toast.error('No windows available for capture');
        return;
      }
      setShowWindowSelector(true);
    } catch (error) {
      toast.error(getSimpleErrorMessage(error));
      console.error('Window list error:', error);
    }
  };

  const handleRegionConfirm = async (region: Region) => {
    setShowRegionSelector(false);
    try {
      onCaptureComplete?.(await captureRegion(region));
    } catch (error) {
      toast.error(getSimpleErrorMessage(error));
      console.error('Capture error:', error);
    }
  };

  const handleWindowConfirm = async (window: WindowInfo) => {
    setShowWindowSelector(false);
    try {
      onCaptureComplete?.(await captureWindow(window.handle));
    } catch (error) {
      toast.error(getSimpleErrorMessage(error));
      console.error('Capture error:', error);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isCapturing}
            onClick={() => setShowRegionSelector(true)}
            className={className}
            aria-label="Capture screenshot"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={10} className="pointer-events-none">
          <p>Capture screenshot</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isCapturing}
            onClick={handleWindowCapture}
            className={className}
            aria-label="Share window"
          >
            <Image className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={10} className="pointer-events-none">
          <p>Share window</p>
        </TooltipContent>
      </Tooltip>

      {showRegionSelector && (
        <RegionSelector
          onConfirm={handleRegionConfirm}
          onCancel={() => setShowRegionSelector(false)}
        />
      )}
      {showWindowSelector && (
        <WindowSelector
          onConfirm={handleWindowConfirm}
          onCancel={() => setShowWindowSelector(false)}
        />
      )}
    </>
  );
}
