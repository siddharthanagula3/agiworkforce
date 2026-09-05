'use client';

/**
 * The composer's "+" panel, lifted out of ChatComposerNew.
 *
 * Skills, Connectors and Plugins are ENTRIES here, not inline lists (founder
 * directive 2026-07-10): the lists live in the settings modal, and
 * per-message skill selection stays on the textarea's @mention dropdown.
 */

import React from 'react';
import {
  Brain,
  Camera,
  Check,
  ChevronRight,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  ImagePlus,
  ListChecks,
  Paperclip,
  Sparkles,
  Telescope,
  Terminal,
  Video,
  X,
} from '@agiworkforce/icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@agiworkforce/ui';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { useTranslation } from 'react-i18next';
import { SendPreview } from '@agiworkforce/unified-chat';
import type { SendPreviewPresentation } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { AnchoredComposerMenu } from './AnchoredComposerMenu';

export const COMPOSER_MENU_SEND_ROUTE_TESTID = 'composer-menu-send-route';

const MENU_LABEL = 'More composer options';
const ROW_LABEL_ATTACH = 'Add photos & files';
const ROW_LABEL_IMAGE = 'Create image';
const ROW_LABEL_VIDEO = 'Create video';
const ROW_LABEL_SCREENSHOT = 'Take a screenshot';
const ROW_LABEL_SCREENSHOT_BUSY = 'Capturing…';
const ROW_LABEL_FOLDER = 'Add working folder';
const ROW_LABEL_SKILLS = 'Skills';
const ROW_LABEL_CONNECTORS = 'Connectors';
const ROW_LABEL_PLUGINS = 'Plugins';
const ROW_LABEL_WEB_SEARCH = 'Web search';
const ROW_LABEL_RESEARCH = 'Deep Research';
const ROW_LABEL_CODE = 'Run code';
const ROW_LABEL_OFFICE = 'Create Office files';
const ROW_LABEL_MEMORY = 'Memory';
const ROW_LABEL_TEMPORARY = 'Temporary chat';
const ROW_LABEL_TEMPORARY_SAVING = 'Temporary chat · saving…';
const ROW_LABEL_MANAGE_CONNECTORS = 'Manage in Settings';
const CONNECTORS_EMPTY_COPY = 'No connectors connected yet.';
const WEB_SEARCH_ON = 'On';
const WEB_SEARCH_OFF = 'Off';
const BADGE_CHECKING = 'Checking';
const BADGE_RETRY = 'Retry';
const BADGE_UNAVAILABLE = 'Unavailable';
const BADGE_UPGRADE = 'Upgrade';
const BADGE_NOT_USED_HERE = 'Not used here';
const BADGE_NOT_SUPPORTED = 'Not supported';
const PLAN_UNVERIFIED_TITLE = 'Your plan could not be verified. Click to retry.';
const PLAN_CHECKING_TITLE = 'Checking your plan.';
const IMAGE_ENTITLEMENT_HINT = 'Image generation is available on Pro and above.';
const VIDEO_ENTITLEMENT_HINT = 'Video generation is available on Max 15x and Enterprise.';
const FOLDER_UNSUPPORTED_TITLE = 'Folder access is not supported in this browser';
const WEB_SEARCH_ON_TITLE =
  'This model can search the web when the question needs current information.';
const WEB_SEARCH_OFF_TITLE =
  'This model has no web-search path, so this turn answers from its training data.';

const ROW_CLASS = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const ROW_HOVER_CLASS = 'hover:bg-muted/60';
const ROW_DISABLED_CLASS = 'cursor-not-allowed opacity-50';
const GLYPH_CLASS = 'h-4 w-4 shrink-0';
const BADGE_BASE_CLASS =
  'shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide';
const BADGE_MUTED_CLASS = 'bg-muted text-muted-foreground';
const BADGE_UPGRADE_CLASS = 'bg-primary/10 text-primary';
const DIVIDER_CLASS = 'my-1 border-t border-border/30';
const CHAT_PANEL_CLASS = 'w-64 p-1.5';

export type MediaAvailabilityStatus = 'loading' | 'ready' | 'error';

export interface ComposerPlusMenuConnector {
  id: string;
  label: string;
  name: string;
  iconBg: string;
  iconText: string;
}

interface MediaGate {
  billingPolicyReady: boolean;
  billingPolicyError: boolean;
  availabilityStatus: MediaAvailabilityStatus;
  modelsAvailable: boolean;
  entitled: boolean;
  noun: string;
  entitlementHint: string;
}

interface MediaBadge {
  label: string;
  upgrade: boolean;
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function mediaGateTitle(gate: MediaGate): string | undefined {
  if (!gate.billingPolicyReady) {
    return gate.billingPolicyError ? PLAN_UNVERIFIED_TITLE : PLAN_CHECKING_TITLE;
  }
  if (gate.availabilityStatus === 'loading') return `Checking configured ${gate.noun} providers.`;
  if (gate.availabilityStatus === 'error') {
    return `${titleCase(gate.noun)} provider availability could not be checked. Click to retry.`;
  }
  if (!gate.modelsAvailable) return `This deployment is not ready for ${gate.noun} generation.`;
  if (!gate.entitled) return gate.entitlementHint;
  return undefined;
}

function mediaGateBadge(gate: MediaGate): MediaBadge | null {
  if (!gate.billingPolicyReady) {
    return { label: gate.billingPolicyError ? BADGE_RETRY : BADGE_CHECKING, upgrade: false };
  }
  if (gate.availabilityStatus !== 'ready' || !gate.modelsAvailable) {
    return {
      label: gate.availabilityStatus === 'loading' ? BADGE_CHECKING : BADGE_UNAVAILABLE,
      upgrade: false,
    };
  }
  if (!gate.entitled) return { label: BADGE_UPGRADE, upgrade: true };
  return null;
}

function RowBadge({ badge }: { badge: MediaBadge }) {
  return (
    <span className={cn(BADGE_BASE_CLASS, badge.upgrade ? BADGE_UPGRADE_CLASS : BADGE_MUTED_CLASS)}>
      {badge.label}
    </span>
  );
}

/**
 * Plugins' own mark: a block grid plus a connection point, distinct from the
 * generic `Globe` glyph `Web search` uses. Shared by the + menu's Plugins row
 * and the AGI Work bar's Plugins entry so neither falls back to a mismatched
 * icon when the account has no connected connectors to show instead.
 */
export function PluginsGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <path d="M11.5 9v6M9 11.5h6" />
    </svg>
  );
}

function ConnectorsGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="3.5" cy="8" r="2" />
      <circle cx="12.5" cy="8" r="2" />
      <path d="M5.5 8h5" />
    </svg>
  );
}

/** Toggle row used in the + menu for connected send options. */
function MenuToggleRow({
  icon: Icon,
  label,
  checked,
  onToggle,
  disabled,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Shown in a tooltip when the row is disabled (e.g. no search path). */
  title?: string;
}) {
  const row = (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-pressed={checked}
      className={cn(ROW_CLASS, disabled ? ROW_DISABLED_CLASS : ROW_HOVER_CLASS)}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {checked && <Check className="h-3.5 w-3.5 text-foreground" />}
    </button>
  );

  if (!disabled || !title) return row;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="block">
            {row}
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="right">{title}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * One connector row inside the Connectors submenu. `role="menuitemcheckbox"`
 * is the correct ARIA role for a toggleable item in a menu (as opposed to
 * `MenuToggleRow`'s plain `aria-pressed` button, used for composer-wide
 * capability toggles rather than a list of named items).
 *
 * Deliberately a plain focusable button, not a `useMenuKeyboard` panel: this
 * submenu renders inside `AnchoredComposerMenu`, which already runs its own
 * document-capture-phase Arrow/Home/End/Escape handling over every focusable
 * element in the popover. A second capture-phase listener here would not
 * replace that one -- both run on every keypress -- and would fight it for
 * which "next item" wins.
 */
function ConnectorCheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-lg py-2 pl-8 pr-3 text-sm transition-colors hover:bg-muted/60"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
    </button>
  );
}

export interface ComposerPlusMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  onRequestClose: () => void;
  closeMenu: () => void;

  onAddFiles: () => void;
  mediaModeActive: boolean;
  mediaModeNoun: string;

  billingPolicyReady: boolean;
  billingPolicyError: boolean;
  mediaAvailabilityStatus: MediaAvailabilityStatus;

  hostCanGenerateImage: boolean;
  imageModelsAvailable: boolean;
  canUseImageGeneration: boolean;
  imageMode: boolean;
  onCreateImage: () => void;

  hostCanGenerateVideo: boolean;
  videoModelsAvailable: boolean;
  canUseVideoGeneration: boolean;
  videoMode: boolean;
  onCreateVideo: () => void;

  canTakeScreenshot: boolean;
  isCapturingScreenshot: boolean;
  onTakeScreenshot: () => void;

  showWorkingFolderRow: boolean;
  canPickFolder: boolean;
  folderName: string | null;
  onPickFolder: () => void;
  onClearFolder: () => void;

  selectedSkillName: string | null;
  onOpenSettings: (section: string) => void;

  connectorsSubmenuOpen: boolean;
  onToggleConnectorsSubmenu: () => void;
  connectors: ComposerPlusMenuConnector[];
  disabledConnectorIds: string[];
  onSetConnectorEnabled: (connectorId: string, enabled: boolean) => void;

  webSearchEnabled: boolean;

  showScopeRow: boolean;
  scopeOpen: boolean;
  scopeDisabled: boolean;
  onToggleScope: () => void;

  researchEnabled: boolean;
  researchDisabled: boolean;
  researchTitle?: string;
  onToggleResearch: () => void;

  codeExecutionEnabled: boolean;
  codeExecutionDisabled: boolean;
  codeExecutionTitle?: string;
  onToggleCodeExecution: () => void;

  officeCreationEnabled: boolean;
  officeCreationDisabled: boolean;
  officeCreationTitle?: string;
  onToggleOfficeCreation: () => void;

  memoryEnabled: boolean;
  memoryDisabled: boolean;
  memoryTitle?: string;
  onToggleMemory: () => void;

  showTemporaryChat: boolean;
  temporaryChatSaving: boolean;
  isIncognito: boolean;
  canToggleIncognito: boolean;
  onToggleIncognito: () => void;

  sendPreviewPresentation?: SendPreviewPresentation;
}

export function ComposerPlusMenu(props: ComposerPlusMenuProps) {
  const { anchorRef, contentRef, open, onRequestClose } = props;

  return (
    <AnchoredComposerMenu
      anchorRef={anchorRef}
      open={open}
      label={MENU_LABEL}
      onRequestClose={onRequestClose}
      align="start"
      contentRef={contentRef}
      className={CHAT_PANEL_CLASS}
    >
      <ChatMenu {...props} />
    </AnchoredComposerMenu>
  );
}

function ImageRow({ props }: { props: ComposerPlusMenuProps }) {
  const gate: MediaGate = {
    billingPolicyReady: props.billingPolicyReady,
    billingPolicyError: props.billingPolicyError,
    availabilityStatus: props.mediaAvailabilityStatus,
    modelsAvailable: props.imageModelsAvailable,
    entitled: props.canUseImageGeneration,
    noun: 'image',
    entitlementHint: IMAGE_ENTITLEMENT_HINT,
  };
  const badge = mediaGateBadge(gate);
  return (
    <button
      type="button"
      onClick={props.onCreateImage}
      title={mediaGateTitle(gate)}
      className={cn(ROW_CLASS, ROW_HOVER_CLASS, props.imageMode && 'text-primary')}
    >
      <ImagePlus
        className={cn(GLYPH_CLASS, props.imageMode ? 'text-primary' : 'text-muted-foreground')}
      />
      <span className="flex-1 text-left">{ROW_LABEL_IMAGE}</span>
      {badge && <RowBadge badge={badge} />}
    </button>
  );
}

function VideoRow({ props }: { props: ComposerPlusMenuProps }) {
  const gate: MediaGate = {
    billingPolicyReady: props.billingPolicyReady,
    billingPolicyError: props.billingPolicyError,
    availabilityStatus: props.mediaAvailabilityStatus,
    modelsAvailable: props.videoModelsAvailable,
    entitled: props.canUseVideoGeneration,
    noun: 'video',
    entitlementHint: VIDEO_ENTITLEMENT_HINT,
  };
  const badge = mediaGateBadge(gate);
  return (
    <button
      type="button"
      onClick={props.onCreateVideo}
      title={mediaGateTitle(gate)}
      className={cn(ROW_CLASS, ROW_HOVER_CLASS, props.videoMode && 'text-primary')}
    >
      <Video
        className={cn(GLYPH_CLASS, props.videoMode ? 'text-primary' : 'text-muted-foreground')}
      />
      <span className="flex-1 text-left">{ROW_LABEL_VIDEO}</span>
      {badge && <RowBadge badge={badge} />}
    </button>
  );
}

function AttachRow({ props }: { props: ComposerPlusMenuProps }) {
  return (
    <button
      type="button"
      onClick={props.onAddFiles}
      disabled={props.mediaModeActive}
      title={
        props.mediaModeActive
          ? `${props.mediaModeNoun} generation works from your prompt only. Leave ${props.mediaModeNoun.toLowerCase()} mode to attach files.`
          : undefined
      }
      className={cn(ROW_CLASS, props.mediaModeActive ? ROW_DISABLED_CLASS : ROW_HOVER_CLASS)}
    >
      <Paperclip className={cn(GLYPH_CLASS, 'text-muted-foreground')} />
      <span className="flex-1 text-left">{ROW_LABEL_ATTACH}</span>
      {props.mediaModeActive && <RowBadge badge={{ label: BADGE_NOT_USED_HERE, upgrade: false }} />}
    </button>
  );
}

function ScreenshotRow({ props }: { props: ComposerPlusMenuProps }) {
  return (
    <button
      type="button"
      disabled={props.isCapturingScreenshot}
      onClick={props.onTakeScreenshot}
      className={cn(ROW_CLASS, props.isCapturingScreenshot ? ROW_DISABLED_CLASS : ROW_HOVER_CLASS)}
    >
      <Camera className={GLYPH_CLASS} />
      <span className="flex-1 text-left">
        {props.isCapturingScreenshot ? ROW_LABEL_SCREENSHOT_BUSY : ROW_LABEL_SCREENSHOT}
      </span>
    </button>
  );
}

function WorkingFolderRow({ props }: { props: ComposerPlusMenuProps }) {
  const { folderName, canPickFolder } = props;
  return (
    <button
      type="button"
      disabled={!canPickFolder}
      title={
        canPickFolder
          ? folderName
            ? `Working folder: ${folderName}`
            : undefined
          : FOLDER_UNSUPPORTED_TITLE
      }
      onClick={props.onPickFolder}
      className={cn(
        ROW_CLASS,
        !canPickFolder && ROW_DISABLED_CLASS,
        canPickFolder && folderName ? cn('text-primary', ROW_HOVER_CLASS) : ROW_HOVER_CLASS,
      )}
    >
      {folderName ? (
        <FolderOpen className={cn(GLYPH_CLASS, 'text-primary')} />
      ) : (
        <Folder className={cn(GLYPH_CLASS, 'text-muted-foreground')} />
      )}
      <span className="flex-1 text-left">{folderName ? folderName : ROW_LABEL_FOLDER}</span>
      {folderName && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            props.onClearFolder();
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Clear working folder"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {!canPickFolder && (
        <span className="text-[12px] text-muted-foreground">{BADGE_NOT_SUPPORTED}</span>
      )}
    </button>
  );
}

function WebSearchStatusRow({ props }: { props: ComposerPlusMenuProps }) {
  return (
    <div
      className={cn(ROW_CLASS, 'text-muted-foreground')}
      title={props.webSearchEnabled ? WEB_SEARCH_ON_TITLE : WEB_SEARCH_OFF_TITLE}
    >
      <Globe className={cn(GLYPH_CLASS, 'text-muted-foreground')} aria-hidden="true" />
      <span className="flex-1 text-left">{ROW_LABEL_WEB_SEARCH}</span>
      <span className="text-[12px] font-medium">
        {props.webSearchEnabled ? WEB_SEARCH_ON : WEB_SEARCH_OFF}
      </span>
    </div>
  );
}

function ChatMenu(props: ComposerPlusMenuProps) {
  const { t } = useTranslation('v3');
  const enabledConnector = (id: string) => !props.disabledConnectorIds.includes(id);

  return (
    <>
      <AttachRow props={props} />

      {props.hostCanGenerateImage && <ImageRow props={props} />}
      {props.hostCanGenerateVideo && <VideoRow props={props} />}

      {props.canTakeScreenshot && <ScreenshotRow props={props} />}
      {props.showWorkingFolderRow && <WorkingFolderRow props={props} />}

      <div className={DIVIDER_CLASS} />

      <button
        type="button"
        onClick={() => {
          props.closeMenu();
          props.onOpenSettings('skills');
        }}
        className={cn(ROW_CLASS, ROW_HOVER_CLASS, props.selectedSkillName && 'text-primary')}
      >
        <Sparkles
          className={cn(
            GLYPH_CLASS,
            props.selectedSkillName ? 'text-primary' : 'text-muted-foreground',
          )}
        />
        <span className="flex-1 text-left">{props.selectedSkillName ?? ROW_LABEL_SKILLS}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Connectors expands into a submenu of the CONNECTED connectors, each
      with an enable/disable checkbox for THIS conversation. The deep link to
      Settings stays, as the last row, for connect/disconnect and per-tool
      permissions. */}
      <button
        type="button"
        onClick={props.onToggleConnectorsSubmenu}
        aria-expanded={props.connectorsSubmenuOpen}
        className={cn(ROW_CLASS, ROW_HOVER_CLASS)}
      >
        <ConnectorsGlyph className={cn(GLYPH_CLASS, 'text-muted-foreground')} />
        <span className="flex-1 text-left">{ROW_LABEL_CONNECTORS}</span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            props.connectorsSubmenuOpen && 'rotate-90',
          )}
        />
      </button>
      {props.connectorsSubmenuOpen && (
        <div role="menu" aria-label={ROW_LABEL_CONNECTORS} className="space-y-0.5 pb-1">
          {props.connectors.length === 0 ? (
            <p className="px-3 py-2 pl-8 text-[12px] text-muted-foreground">
              {CONNECTORS_EMPTY_COPY}
            </p>
          ) : (
            props.connectors.map((connector) => (
              <ConnectorCheckboxRow
                key={connector.id}
                label={connector.label}
                checked={enabledConnector(connector.id)}
                onToggle={() =>
                  props.onSetConnectorEnabled(connector.id, !enabledConnector(connector.id))
                }
              />
            ))
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              props.closeMenu();
              props.onOpenSettings('connectors');
            }}
            className="flex w-full items-center gap-3 rounded-lg py-2 pl-8 pr-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
          >
            {ROW_LABEL_MANAGE_CONNECTORS}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          props.closeMenu();
          props.onOpenSettings('plugins');
        }}
        className={cn(ROW_CLASS, ROW_HOVER_CLASS)}
      >
        <PluginsGlyph className={GLYPH_CLASS} />
        <span className="flex-1 text-left">{ROW_LABEL_PLUGINS}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <div className={DIVIDER_CLASS} />

      {/* Search is ambient (model and deployment driven, not a manual toggle),
      so this is a status row, never a button pretending to control it. */}
      {props.billingPolicyReady && <WebSearchStatusRow props={props} />}

      {/* The AGI Work bar took the strip the scope pill used to sit in, so this
      is now the only way to open that panel. */}
      {props.showScopeRow && (
        <MenuToggleRow
          icon={ListChecks}
          label={t('agiWork.compose.scopeAdd')}
          checked={props.scopeOpen}
          onToggle={props.onToggleScope}
          disabled={props.scopeDisabled}
        />
      )}

      <MenuToggleRow
        icon={Telescope}
        label={ROW_LABEL_RESEARCH}
        checked={props.researchEnabled}
        onToggle={props.onToggleResearch}
        disabled={props.researchDisabled}
        title={props.researchTitle}
      />

      <MenuToggleRow
        icon={Terminal}
        label={ROW_LABEL_CODE}
        checked={props.codeExecutionEnabled}
        onToggle={props.onToggleCodeExecution}
        disabled={props.codeExecutionDisabled}
        title={props.codeExecutionTitle}
      />

      <MenuToggleRow
        icon={FileText}
        label={ROW_LABEL_OFFICE}
        checked={props.officeCreationEnabled}
        onToggle={props.onToggleOfficeCreation}
        disabled={props.officeCreationDisabled}
        title={props.officeCreationTitle}
      />

      <MenuToggleRow
        icon={Brain}
        label={ROW_LABEL_MEMORY}
        checked={props.memoryEnabled}
        onToggle={props.onToggleMemory}
        disabled={props.memoryDisabled}
        title={props.memoryTitle}
      />

      {props.showTemporaryChat && (
        <MenuToggleRow
          icon={EyeOff}
          label={props.temporaryChatSaving ? ROW_LABEL_TEMPORARY_SAVING : ROW_LABEL_TEMPORARY}
          checked={props.isIncognito}
          onToggle={props.onToggleIncognito}
          disabled={!props.canToggleIncognito}
        />
      )}

      {/* Last so the menu's initial focus still lands on an action, and the
      card variant because the compact one opens an `absolute bottom-full`
      popover that this panel's own `overflow-y-auto` would clip. */}
      {props.sendPreviewPresentation && (
        <div data-testid={COMPOSER_MENU_SEND_ROUTE_TESTID}>
          <div className="my-1 border-t border-border/40" />
          <SendPreview presentation={props.sendPreviewPresentation} variant="card" />
        </div>
      )}
    </>
  );
}
