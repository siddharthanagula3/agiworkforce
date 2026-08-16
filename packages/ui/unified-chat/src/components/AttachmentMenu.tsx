import { useState } from 'react';
import type React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Paperclip,
  Camera,
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
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useCapability } from '../lib/capabilities';
import type { WritingStyle } from '../lib/writingStyle';

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
  activeStyle = null,
  onStyleChange,
  children,
}: AttachmentMenuProps): React.ReactElement {
  const [styleOpen, setStyleOpen] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);

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
          {/* Omitted entirely when the host has no code-execution transport
              at all (e.g. a local/Tauri runtime) — disabled-but-visible when
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
