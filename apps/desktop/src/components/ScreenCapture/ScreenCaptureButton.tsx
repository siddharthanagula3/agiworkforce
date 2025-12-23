import { useState } from 'react';
import { Camera, Monitor, CropIcon, Image } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { RegionSelector } from './RegionSelector';
import { useScreenCapture } from '../../hooks/useScreenCapture';
import type { Region, CaptureResult } from '../../types/capture';
import { toast } from 'sonner';

interface ScreenCaptureButtonProps {
  conversationId?: number;
  onCaptureComplete?: (result: CaptureResult) => void;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  disabled?: boolean;
  suppressToasts?: boolean;
  mode?: 'menu' | 'quick';
  className?: string;
}

export function ScreenCaptureButton({
  conversationId,
  onCaptureComplete,
  variant = 'ghost',
  size = 'icon',
  disabled = false,
  suppressToasts = false,
  mode = 'menu',
  className,
}: ScreenCaptureButtonProps) {
  const [showRegionSelector, setShowRegionSelector] = useState(false);
  const { captureFullScreen, captureRegion, isCapturing } = useScreenCapture();

  const handleFullScreen = async () => {
    try {
      const result = await captureFullScreen(conversationId);
      if (!suppressToasts) {
        toast.success('Screen captured successfully');
      }
      onCaptureComplete?.(result);
    } catch (error) {
      toast.error('Failed to capture screen');
      console.error('Capture error:', error);
    }
  };

  const handleRegionCapture = () => {
    setShowRegionSelector(true);
  };

  const handleRegionConfirm = async (region: Region) => {
    setShowRegionSelector(false);
    try {
      const result = await captureRegion(region, conversationId);
      if (!suppressToasts) {
        toast.success('Region captured successfully');
      }
      onCaptureComplete?.(result);
    } catch (error) {
      toast.error('Failed to capture region');
      console.error('Capture error:', error);
    }
  };

  const handleRegionCancel = () => {
    setShowRegionSelector(false);
  };

  if (mode === 'quick') {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              disabled={isCapturing || disabled}
              onClick={handleRegionCapture}
              className={className}
            >
              <Camera className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Capture screenshot</p>
          </TooltipContent>
        </Tooltip>

        {showRegionSelector && (
          <RegionSelector onConfirm={handleRegionConfirm} onCancel={handleRegionCancel} />
        )}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                disabled={isCapturing || disabled}
                className={className}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Screen capture</p>
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleFullScreen} disabled={isCapturing || disabled}>
            <Monitor className="mr-2 h-4 w-4" />
            <span>Capture Full Screen</span>
            <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+S</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleRegionCapture} disabled={isCapturing || disabled}>
            <CropIcon className="mr-2 h-4 w-4" />
            <span>Capture Region</span>
            <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+R</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled>
            <Image className="mr-2 h-4 w-4" />
            <span>Capture Window</span>
            <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showRegionSelector && (
        <RegionSelector onConfirm={handleRegionConfirm} onCancel={handleRegionCancel} />
      )}
    </>
  );
}
