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
import { WindowSelector } from './WindowSelector';
import { useScreenCapture } from '../../hooks/useScreenCapture';
import type { Region, CaptureResult, WindowInfo } from '../../types/capture';
import { toast } from 'sonner';
import { isTauri } from '../../lib/tauri-mock';
import { getSimpleErrorMessage } from '../../lib/errorMessages';

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
  const [showWindowSelector, setShowWindowSelector] = useState(false);
  const { captureFullScreen, captureRegion, captureWindow, getAvailableWindows, isCapturing } =
    useScreenCapture();
  const isMacOS =
    typeof navigator !== 'undefined' &&
    (/Mac|iPhone|iPad|iPod/i.test(navigator.platform || '') ||
      /Mac OS X|Darwin/i.test(navigator.userAgent || ''));
  // AUDIT-ENV-064 fix: Use centralized isTauri detection (now includes __TAURI__ check)
  const useNativeDesktopPicker = isMacOS && isTauri;

  const handleFullScreen = async () => {
    try {
      const result = await captureFullScreen(conversationId);
      if (!suppressToasts) {
        toast.success('Screen captured successfully');
      }
      onCaptureComplete?.(result);
    } catch (error) {
      const message = getSimpleErrorMessage(error);
      toast.error(message);
      console.error('Capture error:', error);
    }
  };

  const handleRegionCapture = async () => {
    if (useNativeDesktopPicker) {
      // AUDIT-CAPTURE-089 fix: Use frontend region selector on macOS instead of native picker
      // The native macOS picker ignores region arguments, so we use our custom selector
      setShowRegionSelector(true);
      return;
    }
    setShowRegionSelector(true);
  };

  const handleWindowCapture = async () => {
    if (useNativeDesktopPicker) {
      // AUDIT-CAPTURE-089 fix: Use frontend window selector on macOS instead of native picker
      // The native macOS picker ignores window handle arguments, so we use our custom selector
      try {
        const windows = await getAvailableWindows();
        if (windows.length === 0) {
          toast.error('No windows available for capture');
          return;
        }
        setShowWindowSelector(true);
      } catch (error) {
        toast.error('Failed to get available windows');
        console.error('Window list error:', error);
      }
      return;
    }

    try {
      const windows = await getAvailableWindows();
      if (windows.length === 0) {
        toast.error('No windows available for capture');
        return;
      }
      setShowWindowSelector(true);
    } catch (error) {
      toast.error('Failed to get available windows');
      console.error('Window list error:', error);
    }
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
      const message = getSimpleErrorMessage(error);
      toast.error(message);
      console.error('Capture error:', error);
    }
  };

  const handleWindowConfirm = async (window: WindowInfo) => {
    setShowWindowSelector(false);
    try {
      const result = await captureWindow(window.handle, conversationId);
      if (!suppressToasts) {
        toast.success(`Window "${window.title}" captured successfully`);
      }
      onCaptureComplete?.(result);
    } catch (error) {
      const message = getSimpleErrorMessage(error);
      toast.error(message);
      console.error('Capture error:', error);
    }
  };

  const handleRegionCancel = () => {
    setShowRegionSelector(false);
  };

  const handleWindowCancel = () => {
    setShowWindowSelector(false);
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
          <TooltipContent
            side="right"
            align="center"
            sideOffset={10}
            className="pointer-events-none"
          >
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
          <TooltipContent
            side="right"
            align="center"
            sideOffset={10}
            className="pointer-events-none"
          >
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

          <DropdownMenuItem onClick={handleWindowCapture} disabled={isCapturing || disabled}>
            <Image className="mr-2 h-4 w-4" />
            <span>Capture Window</span>
            <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+W</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showRegionSelector && (
        <RegionSelector onConfirm={handleRegionConfirm} onCancel={handleRegionCancel} />
      )}

      {showWindowSelector && (
        <WindowSelector onConfirm={handleWindowConfirm} onCancel={handleWindowCancel} />
      )}
    </>
  );
}
