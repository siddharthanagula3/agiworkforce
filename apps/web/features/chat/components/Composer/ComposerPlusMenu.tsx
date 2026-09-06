'use client';

/**
 * The composer's "+" panel, in its two shapes.
 *
 * Chat mode keeps the entry-and-submenu shape: Skills, Connectors and Plugins
 * are rows that expand or open the settings pane. AGI Work mode renders the
 * unified palette both leader products show in their own work mode, one flat
 * list of actions, then a row per connected connector carrying its capability
 * line, then a search field pinned last that filters everything above it and
 * reaches the skill, folder and plugin catalogs the account already has.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronRight,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  ImagePlus,
  ListChecks,
  Paperclip,
  Search,
  Sparkles,
  Telescope,
  Video,
  X,
} from '@agiworkforce/icons';
import {
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useMenuKeyboard,
} from '@agiworkforce/ui';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { useTranslation } from 'react-i18next';
import { cn } from '@shared/lib/utils';
import type { SendPreviewPresentation } from '@agiworkforce/types';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { buildSettingsBrowseHash } from '@/features/directory';
import type { SkillItem } from '@features/chat/hooks/use-skills-list';
import {
  loadPalettePlugins,
  type PalettePlugin,
} from '@features/chat/services/palette-plugin-catalog';
import { AnchoredComposerMenu } from './AnchoredComposerMenu';

export const COMPOSER_PALETTE_SEARCH_TESTID = 'composer-palette-search';

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
const ROW_LABEL_RESEARCH = 'Deep Research';
const ROW_LABEL_OFFICE = 'Create Office files';
const ROW_LABEL_TEMPORARY = 'Temporary chat';
const ROW_LABEL_TEMPORARY_SAVING = 'Temporary chat · saving…';
export const TEMPORARY_CHAT_RETENTION_NOTE =
  "Won't be saved to your history and skips memory for this turn.";
const ROW_LABEL_MANAGE_CONNECTORS = 'Manage in Settings';
const CONNECTORS_EMPTY_COPY = 'No connectors connected yet.';
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

const ROW_CLASS = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const ROW_HOVER_CLASS = 'hover:bg-muted/60';
const ROW_DISABLED_CLASS = 'cursor-not-allowed opacity-50';
const GLYPH_CLASS = 'h-4 w-4 shrink-0';
const BADGE_BASE_CLASS =
  'shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide';
const BADGE_MUTED_CLASS = 'bg-muted text-muted-foreground';
const BADGE_UPGRADE_CLASS = 'bg-primary/10 text-primary';
const DIVIDER_CLASS = 'my-1 border-t border-border/30';
const SECTION_HEADING_CLASS =
  'px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground';
const SEARCH_DOCK_CLASS =
  'sticky -bottom-px z-10 -mx-1.5 mt-1 border-t border-border/30 bg-popover px-1.5 pb-2 pt-1';
const PALETTE_PANEL_CLASS = 'w-80 px-1.5 pt-1.5';
const CHAT_PANEL_CLASS = 'w-64 p-1.5';
const PALETTE_ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemcheckbox"], [data-composer-palette-search]';
const CATALOG_RESULT_LIMIT = 5;

export type MediaAvailabilityStatus = 'loading' | 'ready' | 'error';

export interface ComposerPlusMenuConnector {
  id: string;
  label: string;
  name: string;
  iconBg: string;
  iconText: string;
  description?: string;
}

export interface ComposerPlusMenuFolder {
  id: string;
  name: string;
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
  role,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Shown in a tooltip when the row is disabled (e.g. no search path). */
  title?: string;
  role?: string;
}) {
  const row = (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
      role={role}
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

/** A connected connector as the AGI Work palette shows it: mark, name, capability line. */
function PaletteConnectorRow({
  connector,
  checked,
  onToggle,
}: {
  connector: ComposerPlusMenuConnector;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      data-testid={`composer-palette-connector-${connector.id}`}
      onClick={onToggle}
      className={cn(ROW_CLASS, ROW_HOVER_CLASS, 'items-start text-left')}
    >
      <OfficialConnectorLogo
        connector={connector}
        className="mt-0.5 h-5 w-5 rounded-md shadow-none"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{connector.label}</span>
        {connector.description && (
          <span className="truncate text-[12px] text-muted-foreground">
            {connector.description}
          </span>
        )}
      </span>
      {checked && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />}
    </button>
  );
}

/** A catalog hit under the palette's search field: skill, folder or plugin. */
function PaletteCatalogRow({
  icon: Icon,
  label,
  description,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(ROW_CLASS, ROW_HOVER_CLASS, 'items-start text-left')}
    >
      <Icon className={cn(GLYPH_CLASS, 'mt-0.5 text-muted-foreground')} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {description && (
          <span className="truncate text-[12px] text-muted-foreground">{description}</span>
        )}
      </span>
    </button>
  );
}

export interface ComposerPlusMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  onRequestClose: () => void;
  closeMenu: () => void;
  /** AGI Work mode renders the unified palette instead of the entry-and-submenu menu. */
  workPalette: boolean;

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

  sendPreviewPresentation?: SendPreviewPresentation;
  connectorsSubmenuOpen: boolean;
  onToggleConnectorsSubmenu: () => void;
  connectorsLoading: boolean;
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

  skills: SkillItem[];
  onSelectSkill: (skillName: string) => void;
  folders: ComposerPlusMenuFolder[];
  onSelectFolder: (folderId: string) => void;
}

export function ComposerPlusMenu(props: ComposerPlusMenuProps) {
  const { anchorRef, contentRef, open, onRequestClose, workPalette } = props;

  return (
    <AnchoredComposerMenu
      anchorRef={anchorRef}
      open={open}
      label={MENU_LABEL}
      onRequestClose={onRequestClose}
      align="start"
      contentRef={contentRef}
      autoFocusFirstItem={!workPalette}
      className={workPalette ? PALETTE_PANEL_CLASS : CHAT_PANEL_CLASS}
    >
      {workPalette ? <WorkPalette {...props} /> : <ChatMenu {...props} />}
    </AnchoredComposerMenu>
  );
}

function ImageRow({ props, role }: { props: ComposerPlusMenuProps; role?: string }) {
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
      role={role}
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

function VideoRow({ props, role }: { props: ComposerPlusMenuProps; role?: string }) {
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
      role={role}
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

function AttachRow({ props, role }: { props: ComposerPlusMenuProps; role?: string }) {
  return (
    <button
      type="button"
      role={role}
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

function ScreenshotRow({ props, role }: { props: ComposerPlusMenuProps; role?: string }) {
  return (
    <button
      type="button"
      role={role}
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

function WorkingFolderRow({ props, role }: { props: ComposerPlusMenuProps; role?: string }) {
  const { folderName, canPickFolder } = props;
  return (
    <button
      type="button"
      role={role}
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

      <MenuToggleRow
        icon={Telescope}
        label={ROW_LABEL_RESEARCH}
        checked={props.researchEnabled}
        onToggle={props.onToggleResearch}
        disabled={props.researchDisabled}
        title={props.researchTitle}
      />

      <MenuToggleRow
        icon={FileText}
        label={ROW_LABEL_OFFICE}
        checked={props.officeCreationEnabled}
        onToggle={props.onToggleOfficeCreation}
        disabled={props.officeCreationDisabled}
        title={props.officeCreationTitle}
      />

      <div className={DIVIDER_CLASS} />

      {/* Skills, Connectors and Plugins are ENTRIES here, not inline lists
      (founder directive 2026-07-10). Per-message skill selection stays
      available via the @mention dropdown in the textarea. */}
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

      {props.showScopeRow && (
        <MenuToggleRow
          icon={ListChecks}
          label={t('agiWork.compose.scopeAdd')}
          checked={props.scopeOpen}
          onToggle={props.onToggleScope}
          disabled={props.scopeDisabled}
        />
      )}

      {props.showTemporaryChat && (
        <MenuToggleRow
          icon={EyeOff}
          label={props.temporaryChatSaving ? ROW_LABEL_TEMPORARY_SAVING : ROW_LABEL_TEMPORARY}
          checked={props.isIncognito}
          onToggle={props.onToggleIncognito}
          disabled={!props.canToggleIncognito}
          title={TEMPORARY_CHAT_RETENTION_NOTE}
        />
      )}

      {/* Last in the list and sticky to the panel's own scrollport, the same
      treatment the AGI Work palette uses for its search field, so the send
      status a user opened the menu to check cannot be the part that scrolls
      out of view: this panel is routinely taller than the space above the
      composer. */}
    </>
  );
}

function WorkPalette(props: ComposerPlusMenuProps) {
  const { t } = useTranslation('v3');
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [plugins, setPlugins] = useState<PalettePlugin[]>([]);

  useMenuKeyboard({
    open: props.open,
    onClose: props.onRequestClose,
    panelRef,
    triggerRef: props.anchorRef,
    itemSelector: PALETTE_ITEM_SELECTOR,
  });

  useEffect(() => {
    if (!props.open) setQuery('');
  }, [props.open]);

  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    void loadPalettePlugins().then((entries) => {
      if (!cancelled) setPlugins(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [searching]);

  const normalized = query.trim().toLowerCase();
  const matches = useCallback(
    (...parts: (string | undefined)[]) =>
      normalized.length === 0 ||
      parts.some((part) => part !== undefined && part.toLowerCase().includes(normalized)),
    [normalized],
  );

  const visibleConnectors = useMemo(
    () => props.connectors.filter((connector) => matches(connector.label, connector.description)),
    [props.connectors, matches],
  );

  const skillHits = useMemo(
    () =>
      searching
        ? props.skills
            .filter((skill) => matches(skill.name, skill.description))
            .slice(0, CATALOG_RESULT_LIMIT)
        : [],
    [searching, props.skills, matches],
  );

  const folderHits = useMemo(
    () =>
      searching
        ? props.folders.filter((folder) => matches(folder.name)).slice(0, CATALOG_RESULT_LIMIT)
        : [],
    [searching, props.folders, matches],
  );

  const pluginHits = useMemo(
    () =>
      searching
        ? plugins
            .filter((plugin) => matches(plugin.name, plugin.description))
            .slice(0, CATALOG_RESULT_LIMIT)
        : [],
    [searching, plugins, matches],
  );

  const enabledConnector = (id: string) => !props.disabledConnectorIds.includes(id);

  const openPlugin = useCallback(
    (pluginId: string) => {
      props.closeMenu();
      window.location.hash = buildSettingsBrowseHash('plugins', pluginId);
    },
    [props],
  );

  const actionRows = [
    matches(ROW_LABEL_ATTACH) && <AttachRow key="attach" props={props} role="menuitem" />,
    props.hostCanGenerateImage && matches(ROW_LABEL_IMAGE) && (
      <ImageRow key="image" props={props} role="menuitem" />
    ),
    props.hostCanGenerateVideo && matches(ROW_LABEL_VIDEO) && (
      <VideoRow key="video" props={props} role="menuitem" />
    ),
    props.canTakeScreenshot && matches(ROW_LABEL_SCREENSHOT) && (
      <ScreenshotRow key="screenshot" props={props} role="menuitem" />
    ),
    props.showWorkingFolderRow && matches(ROW_LABEL_FOLDER, props.folderName ?? undefined) && (
      <WorkingFolderRow key="folder" props={props} role="menuitem" />
    ),
    matches(ROW_LABEL_RESEARCH) && (
      <MenuToggleRow
        key="research"
        role="menuitem"
        icon={Telescope}
        label={ROW_LABEL_RESEARCH}
        checked={props.researchEnabled}
        onToggle={props.onToggleResearch}
        disabled={props.researchDisabled}
        title={props.researchTitle}
      />
    ),
    matches(ROW_LABEL_OFFICE) && (
      <MenuToggleRow
        key="office"
        role="menuitem"
        icon={FileText}
        label={ROW_LABEL_OFFICE}
        checked={props.officeCreationEnabled}
        onToggle={props.onToggleOfficeCreation}
        disabled={props.officeCreationDisabled}
        title={props.officeCreationTitle}
      />
    ),
    props.showScopeRow && matches(t('agiWork.compose.scopeAdd')) && (
      <MenuToggleRow
        key="scope"
        role="menuitem"
        icon={ListChecks}
        label={t('agiWork.compose.scopeAdd')}
        checked={props.scopeOpen}
        onToggle={props.onToggleScope}
        disabled={props.scopeDisabled}
      />
    ),
    props.showTemporaryChat && matches(ROW_LABEL_TEMPORARY) && (
      <MenuToggleRow
        key="temporary"
        role="menuitem"
        icon={EyeOff}
        label={props.temporaryChatSaving ? ROW_LABEL_TEMPORARY_SAVING : ROW_LABEL_TEMPORARY}
        checked={props.isIncognito}
        onToggle={props.onToggleIncognito}
        disabled={!props.canToggleIncognito}
        title={TEMPORARY_CHAT_RETENTION_NOTE}
      />
    ),
  ].filter(Boolean);

  const hasResults =
    actionRows.length > 0 ||
    visibleConnectors.length > 0 ||
    skillHits.length > 0 ||
    folderHits.length > 0 ||
    pluginHits.length > 0;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={t('agiWork.compose.palette.label')}
      data-testid="composer-work-palette"
      className="space-y-0.5"
    >
      {actionRows}

      <div className={DIVIDER_CLASS} />
      <p className={SECTION_HEADING_CLASS}>{t('agiWork.compose.palette.connectorsHeading')}</p>
      {props.connectorsLoading ? (
        <div className="flex items-center gap-3 px-3 py-2">
          <Spinner size="sm" aria-label={t('agiWork.compose.palette.connectorsLoading')} />
          <span className="text-[12px] text-muted-foreground">
            {t('agiWork.compose.palette.connectorsLoading')}
          </span>
        </div>
      ) : visibleConnectors.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-muted-foreground">
          {searching ? t('agiWork.compose.palette.noMatches') : CONNECTORS_EMPTY_COPY}
        </p>
      ) : (
        visibleConnectors.map((connector) => (
          <PaletteConnectorRow
            key={connector.id}
            connector={connector}
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
        className={cn(ROW_CLASS, ROW_HOVER_CLASS, 'text-muted-foreground')}
      >
        <ConnectorsGlyph className={GLYPH_CLASS} />
        <span className="flex-1 text-left">{ROW_LABEL_MANAGE_CONNECTORS}</span>
      </button>

      {skillHits.length > 0 && (
        <>
          <p className={SECTION_HEADING_CLASS}>{t('agiWork.compose.palette.skillsHeading')}</p>
          {skillHits.map((skill) => (
            <PaletteCatalogRow
              key={skill.name}
              icon={Sparkles}
              label={skill.name}
              description={skill.description}
              onSelect={() => {
                props.closeMenu();
                props.onSelectSkill(skill.name);
              }}
            />
          ))}
        </>
      )}

      {folderHits.length > 0 && (
        <>
          <p className={SECTION_HEADING_CLASS}>{t('agiWork.compose.palette.foldersHeading')}</p>
          {folderHits.map((folder) => (
            <PaletteCatalogRow
              key={folder.id}
              icon={Folder}
              label={folder.name}
              onSelect={() => {
                props.closeMenu();
                props.onSelectFolder(folder.id);
              }}
            />
          ))}
        </>
      )}

      {pluginHits.length > 0 && (
        <>
          <p className={SECTION_HEADING_CLASS}>{t('agiWork.compose.palette.pluginsHeading')}</p>
          {pluginHits.map((plugin) => (
            <PaletteCatalogRow
              key={plugin.id}
              icon={PluginsGlyph}
              label={plugin.name}
              description={plugin.description}
              onSelect={() => openPlugin(plugin.id)}
            />
          ))}
        </>
      )}

      {searching && !hasResults && (
        <p className="px-3 py-2 text-[12px] text-muted-foreground">
          {t('agiWork.compose.palette.noMatches')}
        </p>
      )}

      {/* Last in the list so Arrow navigation ends on the field, and sticky to
      the panel's own scrollport so the field a user is typing into cannot be
      the part that scrolls away: the palette is routinely taller than the
      space above the composer. */}
      <div className={SEARCH_DOCK_CLASS}>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <Search className={cn(GLYPH_CLASS, 'text-muted-foreground')} aria-hidden="true" />
          <input
            type="text"
            value={query}
            data-composer-palette-search=""
            data-testid={COMPOSER_PALETTE_SEARCH_TESTID}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('agiWork.compose.palette.searchPlaceholder')}
            aria-label={t('agiWork.compose.palette.searchLabel')}
            className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}
