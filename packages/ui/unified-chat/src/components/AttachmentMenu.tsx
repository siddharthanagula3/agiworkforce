import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Paperclip,
  Camera,
  Aperture,
  X,
  Folder,
  FolderPlus,
  HardDrive,
  GitBranch,
  Sparkles,
  Plug,
  BookOpen,
  Globe,
  Terminal,
  Paintbrush,
  ChevronRight,
  ChevronDown,
  Check,
  CircleDot,
  Image as ImageIcon,
  Clapperboard,
  MonitorPlay,
  Video,
  SwitchCamera,
  Pause,
  Play,
} from 'lucide-react';
import {
  idleVisualSessionStatus,
  visualFrameToFile,
  visualSessionIsCapturing,
  visualSourceError,
  VisualCaptureSession,
  type VisualFrame,
  type VisualSessionStatus,
  type VisualSourceKind,
} from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useCapability } from '../lib/capabilities';
import type { WritingStyle } from '../lib/writingStyle';
import type { MediaKind, MediaMode } from '../stores/mediaModeStore';

const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  image: 'Generate image',
  video: 'Generate video',
};

export type StyleOption = WritingStyle;

export interface AttachmentMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddFiles: () => void;
  onScreenshot?: (file: File) => void;
  onSelectFolder?: () => void;
  onRecordSkill?: () => void;
  currentFolderLabel?: string | null;
  onAddToProject?: () => void;
  onAddFromGoogleDrive?: () => void;
  onAddFromGitHub?: () => void;
  researchEnabled: boolean;
  onResearchToggle: () => void;
  supportsResearch?: boolean;
  explicitWebSearchEnabled?: boolean;
  onExplicitWebSearchToggle?: () => void;
  codeExecutionEnabled?: boolean;
  onCodeExecutionToggle?: () => void;
  codeExecutionAvailable?: boolean;
  mediaMode?: MediaMode;
  mediaGenerationKinds?: MediaKind[];
  onMediaModeToggle?: (kind: MediaKind) => void;
  activeStyle?: StyleOption | null;
  onStyleChange?: (style: StyleOption | null) => void;
  /** Every frame the live session keeps, for a host that forwards them to a turn. */
  onLiveVisualFrame?: (frame: VisualFrame, status: VisualSessionStatus) => void;
  children: React.ReactNode;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  hasSubmenu?: boolean;
  submenuOpen?: boolean;
  checked?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}

function MenuItem({
  icon,
  label,
  onClick,
  hasSubmenu,
  submenuOpen,
  checked,
  disabled = false,
  title,
  className,
}: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={checked === undefined ? undefined : checked}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
        'text-[var(--chat-text-primary)] transition-colors duration-100',
        'hover:bg-[var(--chat-surface-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--chat-text-secondary)]">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {checked !== undefined && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {checked && <Check size={13} className="text-[var(--chat-accent-primary-text)]" />}
        </span>
      )}
      {hasSubmenu &&
        (submenuOpen ? (
          <ChevronDown size={13} className="shrink-0 text-[var(--chat-text-muted)]" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-[var(--chat-text-muted)]" />
        ))}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-[var(--chat-border)]" />;
}

type CameraState = 'starting' | 'ready' | 'denied' | 'busy' | 'unavailable';

type CameraFacing = 'user' | 'environment';

const CAMERA_STATE_MESSAGE: Record<Exclude<CameraState, 'ready'>, string> = {
  starting: 'Waiting for camera access…',
  denied: 'Camera access was blocked. Allow it in your system settings to take a photo.',
  busy: 'The camera is in use by another app. Close it and try again.',
  unavailable: 'This app does not have camera access here.',
};

function cameraStateFor(error: unknown): Exclude<CameraState, 'starting' | 'ready'> {
  const state = visualSourceError(error).state;
  return state === 'busy' || state === 'unavailable' ? state : 'denied';
}

function CameraCaptureOverlay({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('starting');
  const [facing, setFacing] = useState<CameraFacing>('user');
  const [canSwitch, setCanSwitch] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }
    let cancelled = false;
    const video = videoRef.current;
    setState('starting');
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((stream) => {
        // The permission prompt can outlive the overlay. A stream that arrives
        // after teardown must still be stopped or the camera stays live with
        // nothing on screen showing it.
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          void video.play();
        }
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(cameraStateFor(error));
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [facing]);

  // Offered only where there is a second camera to switch to: a device list is
  // the only thing that tells a browser apart from a phone here.
  useEffect(() => {
    if (state !== 'ready' || !navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (cancelled) return;
        setCanSwitch(devices.filter((device) => device.kind === 'videoinput').length > 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || state !== 'ready') return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `photo-${Date.now()}.png`, { type: 'image/png' }));
      onClose();
    }, 'image/png');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-full max-w-md overflow-hidden rounded-xl shadow-xl',
          'border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--chat-text-primary)]">Take a photo</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="relative flex aspect-video items-center justify-center bg-[var(--chat-surface-hover)]">
          {/* Mirrored front preview, unmirrored capture: a mirror is what people
              expect of a front camera, but flipping the saved frame would
              reverse text, and a rear camera is not a mirror at all. */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn('h-full w-full object-cover', state !== 'ready' && 'invisible')}
            style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
          />
          {state !== 'ready' && (
            <p className="absolute px-6 text-center text-sm text-[var(--chat-text-secondary)]">
              {CAMERA_STATE_MESSAGE[state]}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3">
          {canSwitch && (
            <button
              type="button"
              onClick={() => setFacing((current) => (current === 'user' ? 'environment' : 'user'))}
              aria-label={facing === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
              className="mr-auto flex h-9 items-center gap-2 rounded-lg border border-[var(--chat-border)] px-3 text-sm text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]"
            >
              <SwitchCamera size={15} aria-hidden="true" />
              {facing === 'user' ? 'Rear camera' : 'Front camera'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[var(--chat-border)] px-3 text-sm text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={state !== 'ready'}
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium',
              'bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)]',
              state !== 'ready' && 'cursor-not-allowed opacity-50',
            )}
          >
            <Aperture size={15} aria-hidden="true" />
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}

const LIVE_SOURCE_TITLE: Record<VisualSourceKind, string> = {
  camera: 'Live camera',
  screen: 'Live screen',
  window: 'Live window',
};

function liveStateLabel(status: VisualSessionStatus): string {
  if (visualSessionIsCapturing(status)) return 'Sharing live';
  if (status.state === 'starting') return 'Starting…';
  if (status.state === 'paused') return 'Paused';
  if (status.error) return status.error;
  return 'Not sharing';
}

/**
 * A live source, sampled rather than streamed: the session decides which frames
 * are worth keeping, this overlay only shows what it is doing and hands the
 * latest kept frame to the composer.
 */
function LiveVisualOverlay({
  source,
  onAttachFrame,
  onFrame,
  onClose,
}: {
  source: VisualSourceKind;
  onAttachFrame: (file: File) => void;
  onFrame?: (frame: VisualFrame, status: VisualSessionStatus) => void;
  onClose: () => void;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<VisualCaptureSession | null>(null);
  const latestRef = useRef<VisualFrame | null>(null);
  const onFrameRef = useRef(onFrame);
  const [status, setStatus] = useState<VisualSessionStatus>(() => idleVisualSessionStatus(source));
  const [hasFrame, setHasFrame] = useState(false);

  onFrameRef.current = onFrame;

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    setStatus({ ...idleVisualSessionStatus(source), state: 'starting' });
    void VisualCaptureSession.start({
      source,
      onStatus: (next) => {
        if (!cancelled) setStatus(next);
      },
      onFrame: (frame) => {
        latestRef.current = frame;
        if (!cancelled) setHasFrame(true);
        onFrameRef.current?.(frame, sessionRef.current?.status ?? idleVisualSessionStatus(source));
      },
    })
      .then((session) => {
        if (cancelled) {
          session.stop();
          return;
        }
        sessionRef.current = session;
        if (video) {
          video.srcObject = session.mediaStream;
          void video.play().catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const failure = visualSourceError(error);
        setStatus({
          ...idleVisualSessionStatus(source),
          state: failure.state,
          error: failure.message,
        });
      });

    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
      latestRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [source]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const capturing = visualSessionIsCapturing(status);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={LIVE_SOURCE_TITLE[source]}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'w-full max-w-md overflow-hidden rounded-xl shadow-xl',
          'border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)]',
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--chat-text-primary)]">
            {LIVE_SOURCE_TITLE[source]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="relative flex aspect-video items-center justify-center bg-[var(--chat-surface-hover)]">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn('h-full w-full object-contain', !capturing && 'invisible')}
          />
          {!capturing && (
            <p className="absolute px-6 text-center text-sm text-[var(--chat-text-secondary)]">
              {liveStateLabel(status)}
            </p>
          )}
        </div>

        {/* The indicator answers "is this source live right now", so it is bound
            to the session state and never to whether the overlay is open. */}
        <div className="flex items-center gap-2 border-t border-[var(--chat-border)] px-4 py-2">
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 rounded-full',
              capturing
                ? 'bg-[var(--chat-destructive)] motion-safe:animate-pulse'
                : 'bg-[var(--chat-text-muted)]',
            )}
          />
          <span
            role="status"
            className={cn(
              'text-xs',
              capturing
                ? 'text-[var(--chat-destructive-text)]'
                : 'text-[var(--chat-text-secondary)]',
            )}
          >
            {liveStateLabel(status)}
          </span>
          <span className="ml-auto text-xs text-[var(--chat-text-muted)]">
            {status.sampledFrames} kept · {status.droppedFrames} skipped
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              const session = sessionRef.current;
              if (!session) return;
              if (session.status.state === 'paused') session.resume();
              else session.pause();
            }}
            disabled={!capturing && status.state !== 'paused'}
            className={cn(
              'mr-auto flex h-9 items-center gap-2 rounded-lg border border-[var(--chat-border)] px-3 text-sm',
              'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
              !capturing && status.state !== 'paused' && 'cursor-not-allowed opacity-50',
            )}
          >
            {status.state === 'paused' ? (
              <Play size={15} aria-hidden="true" />
            ) : (
              <Pause size={15} aria-hidden="true" />
            )}
            {status.state === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[var(--chat-border)] px-3 text-sm text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]"
          >
            Stop sharing
          </button>
          <button
            type="button"
            onClick={() => {
              const frame = latestRef.current;
              if (!frame) return;
              onAttachFrame(visualFrameToFile(frame));
              onClose();
            }}
            disabled={!hasFrame}
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium',
              'bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)]',
              !hasFrame && 'cursor-not-allowed opacity-50',
            )}
          >
            <Aperture size={15} aria-hidden="true" />
            Attach latest frame
          </button>
        </div>
      </div>
    </div>
  );
}

const STYLE_OPTIONS: { value: StyleOption; label: string }[] = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
];

export function AttachmentMenu({
  open,
  onOpenChange,
  onAddFiles,
  onScreenshot,
  onSelectFolder,
  onRecordSkill,
  currentFolderLabel = null,
  onAddToProject,
  onAddFromGoogleDrive,
  onAddFromGitHub,
  researchEnabled,
  onResearchToggle,
  supportsResearch = false,
  explicitWebSearchEnabled = false,
  onExplicitWebSearchToggle,
  codeExecutionEnabled = false,
  onCodeExecutionToggle,
  codeExecutionAvailable = false,
  mediaMode = 'text',
  mediaGenerationKinds,
  onMediaModeToggle,
  activeStyle = null,
  onStyleChange,
  onLiveVisualFrame,
  children,
}: AttachmentMenuProps): React.ReactElement {
  const [styleOpen, setStyleOpen] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [liveSource, setLiveSource] = useState<VisualSourceKind | null>(null);

  const canTakeScreenshot = useCapability('canTakeScreenshot');

  const canUseWorkingDirectory = useCapability('canUseWorkingDirectory');
  const hasSourceAction = Boolean(onAddToProject || onAddFromGoogleDrive || onAddFromGitHub);

  const handleScreenshot = async () => {
    if (!onScreenshot) {
      onOpenChange(false);
      return;
    }
    setScreenshotting(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          void video.play();
          resolve();
        };
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
      }
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;

      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
        onScreenshot(file);
      }, 'image/png');
      onOpenChange(false);
    } catch {
      return;
    } finally {
      setScreenshotting(false);
    }
  };

  return (
    <>
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger asChild>{children}</Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={8}
            className={cn(
              'z-50 w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--chat-border)]',
              'bg-[var(--chat-surface-elevated)] shadow-xl',
              'p-1.5',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
              'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
              'data-[side=top]:slide-in-from-bottom-2',
            )}
          >
            {/* Group 1: Files */}
            <MenuItem
              icon={<Paperclip size={15} />}
              label="Add files or photos"
              onClick={() => {
                onAddFiles();
                onOpenChange(false);
              }}
            />
            {onRecordSkill && (
              <MenuItem
                icon={<CircleDot size={15} />}
                label="Record a skill"
                onClick={() => {
                  onRecordSkill();
                  onOpenChange(false);
                }}
              />
            )}
            {canTakeScreenshot && (
              <MenuItem
                icon={<Camera size={15} />}
                label={screenshotting ? 'Capturing…' : 'Take a screenshot'}
                onClick={handleScreenshot}
                className={screenshotting ? 'opacity-60 pointer-events-none' : undefined}
              />
            )}
            {/* Not capability-gated the way screen capture is: a webcam is the one
              attachment source every host in this package runs on has, and the
              overlay owns the permission prompt, the preview and the teardown. */}
            {onScreenshot && (
              <MenuItem
                icon={<Aperture size={15} />}
                label="Take a photo"
                onClick={() => {
                  onOpenChange(false);
                  setCameraOpen(true);
                }}
              />
            )}
            {/* Live sources sit behind the same sink as a still capture: the
              session samples continuously, and what reaches the composer is the
              frame the user chose to attach. */}
            {onScreenshot && (
              <MenuItem
                icon={<Video size={15} />}
                label="Share live camera"
                onClick={() => {
                  onOpenChange(false);
                  setLiveSource('camera');
                }}
              />
            )}
            {onScreenshot && canTakeScreenshot && (
              <MenuItem
                icon={<MonitorPlay size={15} />}
                label="Share live screen"
                onClick={() => {
                  onOpenChange(false);
                  setLiveSource('screen');
                }}
              />
            )}
            {/* Handler presence is part of the gate: hosts withhold onSelectFolder
              (e.g. desktop in non-local privacy mode) to hide the row instead of
              rendering a dead control. */}
            {canUseWorkingDirectory && onSelectFolder && (
              <MenuItem
                icon={<Folder size={15} />}
                label={currentFolderLabel ? `Folder: ${currentFolderLabel}` : 'Select folder'}
                onClick={() => {
                  onSelectFolder?.();
                  onOpenChange(false);
                }}
              />
            )}

            {hasSourceAction && (
              <>
                <Divider />

                {/* Group 2: host-owned source pickers. A label is rendered only
                  when the host provides the corresponding real flow. */}
                {onAddToProject && (
                  <MenuItem
                    icon={<FolderPlus size={15} />}
                    label="Add to project"
                    onClick={() => {
                      onAddToProject();
                      onOpenChange(false);
                    }}
                  />
                )}
                {onAddFromGoogleDrive && (
                  <MenuItem
                    icon={<HardDrive size={15} />}
                    label="Add from Google Drive"
                    onClick={() => {
                      onAddFromGoogleDrive();
                      onOpenChange(false);
                    }}
                  />
                )}
                {onAddFromGitHub && (
                  <MenuItem
                    icon={<GitBranch size={15} />}
                    label="Add from GitHub"
                    onClick={() => {
                      onAddFromGitHub();
                      onOpenChange(false);
                    }}
                  />
                )}
              </>
            )}

            <Divider />

            {/* Group 3: Capabilities */}
            <MenuItem
              icon={<Sparkles size={15} />}
              label="Skills"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('chat:action', {
                    detail: { type: 'open-settings', tab: 'skills' },
                  }),
                );
                onOpenChange(false);
              }}
            />
            <MenuItem
              icon={<Plug size={15} />}
              label="Connectors"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('chat:action', {
                    detail: { type: 'open-settings', tab: 'connectors' },
                  }),
                );
                onOpenChange(false);
              }}
            />

            <Divider />

            {/* Group 4: Toggleable modes */}
            {onExplicitWebSearchToggle && (
              <MenuItem
                icon={<Globe size={15} />}
                label="Search the web"
                checked={explicitWebSearchEnabled}
                title="Allows network access for this message"
                onClick={onExplicitWebSearchToggle}
              />
            )}
            {supportsResearch && (
              <MenuItem
                icon={<BookOpen size={15} />}
                label="Research"
                checked={researchEnabled}
                onClick={onResearchToggle}
              />
            )}
            {/* Listed per kind the runtime actually generates, so a host with no
              video transport never renders a video entry that the send would
              silently downgrade to an ordinary chat turn. */}
            {onMediaModeToggle &&
              (mediaGenerationKinds ?? []).map((kind) => (
                <MenuItem
                  key={kind}
                  icon={kind === 'image' ? <ImageIcon size={15} /> : <Clapperboard size={15} />}
                  label={MEDIA_KIND_LABEL[kind]}
                  checked={mediaMode === kind}
                  onClick={() => onMediaModeToggle(kind)}
                />
              ))}
            {/* Omitted entirely when the host has no code-execution transport
              at all (e.g. a local/Tauri runtime), disabled-but-visible when
              present but unavailable for the current model/provider/
              deployment, so it's never rendered as a control the server
              would silently ignore. */}
            {onCodeExecutionToggle && (
              <MenuItem
                icon={<Terminal size={15} />}
                label="Run code"
                checked={codeExecutionEnabled}
                disabled={!codeExecutionAvailable}
                title={
                  !codeExecutionAvailable
                    ? "Code execution isn't available for this model or plan"
                    : undefined
                }
                onClick={onCodeExecutionToggle}
              />
            )}

            <Divider />

            {/* Group 5: Style, inline expandable submenu */}
            <MenuItem
              icon={<Paintbrush size={15} />}
              label={
                activeStyle
                  ? `Style: ${STYLE_OPTIONS.find((s) => s.value === activeStyle)?.label ?? ''}`
                  : 'Use style'
              }
              hasSubmenu
              submenuOpen={styleOpen}
              onClick={() => setStyleOpen((v) => !v)}
            />
            {styleOpen && (
              <div className="mt-0.5 ml-8 flex flex-col gap-0.5">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onStyleChange?.(activeStyle === opt.value ? null : opt.value);
                      setStyleOpen(false);
                      onOpenChange(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm',
                      'transition-colors duration-100',
                      'hover:bg-[var(--chat-surface-hover)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                      activeStyle === opt.value
                        ? 'text-[var(--chat-accent-primary-text)]'
                        : 'text-[var(--chat-text-primary)]',
                    )}
                  >
                    <span>{opt.label}</span>
                    {activeStyle === opt.value && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {cameraOpen && onScreenshot && (
        <CameraCaptureOverlay onCapture={onScreenshot} onClose={() => setCameraOpen(false)} />
      )}
      {liveSource && onScreenshot && (
        <LiveVisualOverlay
          source={liveSource}
          onAttachFrame={onScreenshot}
          {...(onLiveVisualFrame ? { onFrame: onLiveVisualFrame } : {})}
          onClose={() => setLiveSource(null)}
        />
      )}
    </>
  );
}
