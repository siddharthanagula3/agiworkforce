import { useState } from 'react';
import type React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Paperclip,
  Camera,
  FolderPlus,
  HardDrive,
  GitBranch,
  Sparkles,
  Plug,
  BookOpen,
  Globe,
  Paintbrush,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export type StyleOption = 'formal' | 'casual' | 'concise' | 'detailed';

export interface AttachmentMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user picks "Add files or photos" */
  onAddFiles: () => void;
  /** Called with a screenshot File when capture succeeds */
  onScreenshot?: (file: File) => void;
  /** Whether Web search is currently toggled on */
  webSearchEnabled: boolean;
  onWebSearchToggle: () => void;
  /** Whether Research mode is currently toggled on */
  researchEnabled: boolean;
  onResearchToggle: () => void;
  /** Currently active style, or null for none */
  activeStyle?: StyleOption | null;
  onStyleChange?: (style: StyleOption | null) => void;
  children: React.ReactNode;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  hasSubmenu?: boolean;
  submenuOpen?: boolean;
  checked?: boolean;
  className?: string;
}

function MenuItem({
  icon,
  label,
  onClick,
  hasSubmenu,
  submenuOpen,
  checked,
  className,
}: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
        'text-[var(--chat-text-primary)] transition-colors duration-100',
        'hover:bg-[var(--chat-surface-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
        className,
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--chat-text-secondary)]">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {checked !== undefined && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {checked && <Check size={13} className="text-[var(--chat-accent-primary)]" />}
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
  webSearchEnabled,
  onWebSearchToggle,
  researchEnabled,
  onResearchToggle,
  activeStyle = null,
  onStyleChange,
  children,
}: AttachmentMenuProps): React.ReactElement {
  const [styleOpen, setStyleOpen] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);

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
      // Render stream into a video element to grab a frame
      const video = document.createElement('video');
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          void video.play();
          resolve();
        };
      });
      // Brief pause to ensure first frame is painted
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
      // User cancelled or permission denied — silently ignore
    } finally {
      setScreenshotting(false);
    }
  };

  return (
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
          <MenuItem
            icon={<Camera size={15} />}
            label={screenshotting ? 'Capturing…' : 'Take a screenshot'}
            onClick={handleScreenshot}
            className={screenshotting ? 'opacity-60 pointer-events-none' : undefined}
          />

          <Divider />

          {/* Group 2: Sources */}
          <MenuItem
            icon={<FolderPlus size={15} />}
            label="Add to project"
            onClick={() => {
              toast.info('Projects coming soon');
              onOpenChange(false);
            }}
          />
          <MenuItem
            icon={<HardDrive size={15} />}
            label="Add from Google Drive"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('chat:action', {
                  detail: { type: 'open-settings', tab: 'connectors' },
                }),
              );
              toast.info('Connect Google Drive in Settings first');
              onOpenChange(false);
            }}
          />
          <MenuItem
            icon={<GitBranch size={15} />}
            label="Add from GitHub"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('chat:action', {
                  detail: { type: 'open-settings', tab: 'connectors' },
                }),
              );
              toast.info('Connect GitHub in Settings first');
              onOpenChange(false);
            }}
          />

          <Divider />

          {/* Group 3: Capabilities */}
          <MenuItem
            icon={<Sparkles size={15} />}
            label="Skills"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('chat:action', {
                  detail: { type: 'open-settings', tab: 'mcp-skills' },
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
          <MenuItem
            icon={<BookOpen size={15} />}
            label="Research"
            checked={researchEnabled}
            onClick={onResearchToggle}
          />
          <MenuItem
            icon={<Globe size={15} />}
            label="Web search"
            checked={webSearchEnabled}
            onClick={onWebSearchToggle}
          />

          <Divider />

          {/* Group 5: Style — inline expandable submenu */}
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
                      ? 'text-[var(--chat-accent-primary)]'
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
  );
}
