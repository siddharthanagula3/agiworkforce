'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AttachmentPreview } from '@features/chat/components/Composer/AttachmentPreview';
import { useCodeImages } from '../hooks/use-code-images';
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Cloud,
  Code2,
  Folder,
  GitBranch,
  ImagePlus,
  Lightbulb,
  Lock,
  Mic,
  Monitor,
  Plug,
  Plus,
  Search,
  Square,
  Terminal,
  X,
} from '@agiworkforce/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from '@agiworkforce/ui';
import {
  CLOUD_CODE_DEFAULT_TURN_MODE,
  CLOUD_CODE_GOAL_COMMANDS,
  cloudCodeRepositoryLabel,
  describeCloudCodeRuntime,
  isBillingPlanTier,
  isFreeBillingPlanTier,
  selectUsageWarning,
  type CloudCodeNetworkAccess,
  type CloudCodeRepositoryReference,
  type CloudCodeRuntime,
  type CloudCodeTurnMode,
} from '@agiworkforce/types';
import {
  DEVELOPER_AGENT_MODE_LABELS,
  type DeveloperAgentMode,
} from '@agiworkforce/local-runtime-contract';
import Link from 'next/link';
import {
  SlashCommandMenu,
  UsageWarningBanner,
  type CommandSuggestion,
} from '@agiworkforce/unified-chat';
import { isImeComposingKey } from '@agiworkforce/unified-chat/ime-composition';
import { ComposerFooter } from '@features/chat/components/Composer/ComposerFooter';
import { DictationStrip } from '@features/chat/components/Composer/DictationStrip';
import { getProviderModeForModel } from '@shared/lib/provider-mode-for-model';
import {
  DICTATION_DISABLED_IN_SETTINGS,
  dictationSwitchedOffReason,
  useDictation,
} from '@features/chat/hooks/use-dictation';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { safePlatform } from '@shared/utils/browser-utils';
import {
  readManagedUsageBuckets,
  useManagedUsageSummary,
} from '@/lib/hooks/useManagedUsageSummary';
import { useGuardedRouter } from '@shared/hooks/use-guarded-router';
import { openUpgrade } from '@shared/lib/app-commands';
import {
  listLocalBranches,
  switchLocalBranch,
  useDeveloperCapabilities,
} from '@/features/desktop-host';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { toUserMessage } from '@/lib/user-error-message';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import {
  DEFAULT_TOOL_APPROVAL_PREFERENCES,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES,
  TOOL_APPROVAL_POLICY_OPTIONS,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
  type ToolApprovalPreferences,
} from '@shared/types/toolApprovalPolicy';
import {
  CODE_COPY,
  CODE_GOAL_COMMAND_DESCRIPTIONS,
  CODE_LIMITS,
  CODE_NETWORK_OPTIONS,
  CODE_ROUTES,
  githubInstallHref,
  DEFAULT_CODE_ENVIRONMENT,
  DEFAULT_NETWORK_ACCESS,
  DEFAULT_RUNTIME_ID,
  REPOSITORY_MINIMUM_NETWORK_ACCESS,
  contextWindowLabel,
  environmentChipLabel,
  formatResetIn,
  type CodeEnvironment,
} from '../code-surface';
import {
  LOCAL_CODE_COPY,
  LOCAL_AGENT_MODE_HINTS,
  LOCAL_PLACEMENT_HEADING,
  LOCAL_PLACEMENT_HINTS,
  LOCAL_PLACEMENT_LABELS,
  LOCAL_PLACEMENTS,
  type LocalFolderChoice,
  type LocalModelChoice,
  type LocalPlacement,
  type LocalProviderSetup,
} from '../local-code';
import { LocalModelChip } from './LocalModelChip';
import { runtimeHelpText, type HarnessModelChoice } from '../code-runtime';
import { useCodeRepositories, type CodeRepositoryState } from '../hooks/use-code-repositories';
import { useCodeBranches } from '../hooks/use-code-branches';
import {
  canonicalGitHubRepositoryBranch,
  canonicalGitHubRepositoryUrl,
  type CloudCodeApi,
  type CloudCodeRepository,
} from '@agiworkforce/cloud-contracts';
import styles from '../CloudCodePage.module.css';

const CHIP_GLYPH_SIZE = 14;
const CONTROL_GLYPH_SIZE = 16;
const SEND_GLYPH_SIZE = 16;
const POPOVER_WIDTH = 320;
const POPOVER_OFFSET = 8;
const ENTER_KEY = 'Enter';
const SEND_AND_STAY_SHORTCUTS = 'Meta+Enter Control+Enter';
const COMMAND_QUERY = /^\/[a-z-]*$/i;
const FIRST_SHORTCUT = 1;
const PLAN_TURN_MODE = 'plan' satisfies CloudCodeTurnMode;
const USAGE_RING_SIZE = 16;
const USAGE_RING_STROKE = 3;
const RING_RADIUS = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PERCENT_MAX = 100;
const CHIP_TEXT_TRUNCATE = 'min-w-0 max-w-[12rem] truncate';

export interface CodeDraft {
  environment: CodeEnvironment;
  localRootId: string | null;
  localModelId: string;
  networkAccess: CloudCodeNetworkAccess;
  fullNetworkAccepted: boolean;
  extraHosts: string;
  runtimeId: string;
  harnessCredential: string;
  harnessModelId: string;
  repositoryUrl: string;
  repositoryBranch: string;
  repository: CloudCodeRepositoryReference | null;
}

export const EMPTY_CODE_DRAFT: CodeDraft = {
  environment: DEFAULT_CODE_ENVIRONMENT,
  localRootId: null,
  localModelId: '',
  networkAccess: DEFAULT_NETWORK_ACCESS,
  fullNetworkAccepted: false,
  extraHosts: '',
  runtimeId: DEFAULT_RUNTIME_ID,
  harnessCredential: '',
  harnessModelId: '',
  repositoryUrl: '',
  repositoryBranch: '',
  repository: null,
};

export interface CodeLocalState {
  agentMode: DeveloperAgentMode;
  supported: boolean;
  /** The shell can start a session in a new worktree, so the placement choice is offered. */
  worktrees: boolean;
  folders: LocalFolderChoice[];
  models: LocalModelChoice[];
  setups: LocalProviderSetup[];
  modelId: string;
  modelUnreachable: boolean;
  adding: boolean;
  /** Where a new local session runs: the folder itself or a new worktree of it. */
  placement: LocalPlacement;
  primaryRootId: string | null;
  onMakePrimary: (rootId: string) => void;
  onAddFolder: () => void;
  onModelChange: (modelId: string) => void;
  onBranchSwitched: () => void;
  onPlacementChange: (placement: LocalPlacement) => void;
}

export function draftRepositoryLabel(draft: CodeDraft): string {
  return draft.repository
    ? draft.repository.fullName
    : cloudCodeRepositoryLabel(draft.repositoryUrl);
}

export function draftHasRepository(draft: CodeDraft): boolean {
  return draft.repository !== null || draft.repositoryUrl.trim().length > 0;
}

export interface CodeRepositoryEntry {
  url: string;
  branch: string;
}

function EnvironmentSettings({
  draft,
  runtimes,
  harnessModels,
  disabled,
  onDraftChange,
  onOpenEmpty,
}: {
  draft: CodeDraft;
  runtimes: CloudCodeRuntime[];
  harnessModels: readonly HarnessModelChoice[];
  disabled: boolean;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onOpenEmpty?: () => void;
}) {
  const runtimeFieldId = useId();
  const runtimeHelpId = `${runtimeFieldId}-help`;
  const extraHostsFieldId = useId();
  const extraHostsHelpId = `${extraHostsFieldId}-help`;
  const credentialFieldId = useId();
  const harnessModelFieldId = useId();
  const credentialHelpId = `${credentialFieldId}-help`;
  const harnesses = runtimes.filter((runtime) => runtime.kind === 'harness');
  const images = runtimes.filter((runtime) => runtime.kind === 'image');
  const selectedRuntime = runtimes.find((runtime) => runtime.id === draft.runtimeId) ?? null;

  return (
    <div className={styles['popover']}>
      <span className={styles['popoverHeading']}>{CODE_COPY.environmentHeading}</span>
      <div
        className={styles['optionList']}
        role="radiogroup"
        aria-label={CODE_COPY.environmentHeading}
      >
        {CODE_NETWORK_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={`${styles['option']} ${
              draft.networkAccess === option.id ? styles['optionSelected'] : ''
            }`}
          >
            <input
              type="radio"
              name="code-network-access"
              value={option.id}
              checked={draft.networkAccess === option.id}
              onChange={() =>
                onDraftChange({
                  networkAccess: option.id,
                  ...(option.id === 'full' ? {} : { fullNetworkAccepted: false }),
                })
              }
            />
            <span>
              <span className={styles['optionLabel']}>{option.label}</span>
              <span className={styles['optionCopy']}>{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      {draft.networkAccess === 'full' ? (
        <label className={styles['acknowledgement']}>
          <input
            type="checkbox"
            checked={draft.fullNetworkAccepted}
            onChange={(event) => onDraftChange({ fullNetworkAccepted: event.target.checked })}
          />
          <span>{CODE_COPY.fullNetworkAcknowledgement}</span>
        </label>
      ) : (
        <div className={styles['formField']}>
          <label className={styles['formLabel']} htmlFor={extraHostsFieldId}>
            {CODE_COPY.extraHostsLabel}
          </label>
          <input
            id={extraHostsFieldId}
            aria-describedby={extraHostsHelpId}
            className={styles['textInput']}
            value={draft.extraHosts}
            onChange={(event) => onDraftChange({ extraHosts: event.target.value })}
            placeholder={CODE_COPY.extraHostsPlaceholder}
            maxLength={CODE_LIMITS.extraHosts}
          />
          <span className={styles['formHelp']} id={extraHostsHelpId}>
            {CODE_COPY.extraHostsHelp}
          </span>
        </div>
      )}

      <div className={styles['formField']}>
        <label className={styles['formLabel']} htmlFor={runtimeFieldId}>
          {CODE_COPY.environmentImageHeading}
        </label>
        <select
          id={runtimeFieldId}
          aria-describedby={runtimeHelpId}
          className={styles['select']}
          value={draft.runtimeId}
          onChange={(event) => onDraftChange({ runtimeId: event.target.value, harnessModelId: '' })}
          disabled={runtimes.length === 0}
        >
          <option value={DEFAULT_RUNTIME_ID}>{CODE_COPY.defaultRuntimeOption}</option>
          {harnesses.length > 0 && (
            <optgroup label={CODE_COPY.harnessGroup}>
              {harnesses.map((runtime) => (
                <option key={runtime.id} value={runtime.id}>
                  {describeCloudCodeRuntime(runtime)}
                </option>
              ))}
            </optgroup>
          )}
          {images.length > 0 && (
            <optgroup label={CODE_COPY.imageGroup}>
              {images.map((runtime) => (
                <option key={runtime.id} value={runtime.id}>
                  {describeCloudCodeRuntime(runtime)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span className={styles['formHelp']} id={runtimeHelpId}>
          {runtimeHelpText(runtimes.length, selectedRuntime)}
        </span>
      </div>
      {harnessModels.length > 0 ? (
        <div className={styles['formField']}>
          <label className={styles['formLabel']} htmlFor={harnessModelFieldId}>
            {CODE_COPY.harnessModelLabel}
          </label>
          <select
            id={harnessModelFieldId}
            className={styles['select']}
            value={draft.harnessModelId}
            onChange={(event) => onDraftChange({ harnessModelId: event.target.value })}
          >
            <option value="">{CODE_COPY.harnessModelDefault}</option>
            {harnessModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {selectedRuntime?.needsUserCredential ? (
        <div className={styles['formField']}>
          <label className={styles['formLabel']} htmlFor={credentialFieldId}>
            {CODE_COPY.harnessCredentialLabel}
          </label>
          <input
            id={credentialFieldId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            required
            aria-describedby={credentialHelpId}
            className={styles['textInput']}
            value={draft.harnessCredential}
            onChange={(event) => onDraftChange({ harnessCredential: event.target.value })}
            maxLength={CODE_LIMITS.harnessCredential}
          />
          <span className={styles['formHelp']} id={credentialHelpId}>
            {CODE_COPY.harnessCredentialHelp}
          </span>
        </div>
      ) : null}

      {onOpenEmpty && (
        <div className={styles['popoverActions']}>
          <button
            type="button"
            className={styles['secondaryButton']}
            disabled={disabled || (draft.networkAccess === 'full' && !draft.fullNetworkAccepted)}
            onClick={onOpenEmpty}
          >
            {CODE_COPY.openEmptyEnvironment}
          </button>
        </div>
      )}
    </div>
  );
}

function LocalFolderItems({
  local,
  selectedRootId,
  onDraftChange,
  onCloseMenu,
}: {
  local: CodeLocalState;
  selectedRootId: string | null;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onCloseMenu: () => void;
}) {
  return (
    <>
      <DropdownMenuRadioGroup
        value={selectedRootId ?? ''}
        onValueChange={(value) => onDraftChange({ environment: 'local', localRootId: value })}
      >
        {local.folders.map((choice) => {
          const secondary =
            choice.unavailable === null ? choice.branch : CODE_COPY.environmentFolderUnavailable;
          return (
            <DropdownMenuRadioItem key={choice.rootId} value={choice.rootId}>
              <span className={styles['menuRowLabel']}>
                <span className={styles['optionLabel']}>{choice.name}</span>
                {secondary && <span className={styles['optionCopy']}>{secondary}</span>}
              </span>
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
      {local.folders
        .filter((choice) => choice.rootId !== local.primaryRootId && choice.unavailable === null)
        .map((choice) => (
          <DropdownMenuItem
            key={`primary-${choice.rootId}`}
            onSelect={() => local.onMakePrimary(choice.rootId)}
          >
            Make primary
          </DropdownMenuItem>
        ))}
      <DropdownMenuItem
        disabled={local.adding}
        onSelect={(event) => {
          event.preventDefault();
          onCloseMenu();
          local.onAddFolder();
        }}
      >
        <Plus size={CHIP_GLYPH_SIZE} aria-hidden="true" />
        <span className={styles['menuRowLabel']}>
          {local.adding ? LOCAL_CODE_COPY.addingFolder : LOCAL_CODE_COPY.addFolder}
        </span>
      </DropdownMenuItem>
    </>
  );
}

function LocalFolderChip({
  folder,
  local,
  onDraftChange,
}: {
  folder: LocalFolderChoice;
  local: CodeLocalState;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={styles['chip']}
          aria-label={`${CODE_COPY.folderMenu}: ${folder.name}`}
          title={folder.name}
        >
          <Folder size={CHIP_GLYPH_SIZE} aria-hidden="true" />
          <span className={CHIP_TEXT_TRUNCATE}>{folder.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuLabel>{CODE_COPY.environmentLocal}</DropdownMenuLabel>
        <LocalFolderItems
          local={local}
          selectedRootId={folder.rootId}
          onDraftChange={onDraftChange}
          onCloseMenu={() => setMenuOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EnvironmentChip({
  draft,
  runtimes,
  harnessModels,
  local,
  disabled,
  onDraftChange,
  onOpenEmpty,
}: {
  draft: CodeDraft;
  runtimes: CloudCodeRuntime[];
  harnessModels: readonly HarnessModelChoice[];
  local: CodeLocalState;
  disabled: boolean;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onOpenEmpty: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isLocal = draft.environment === 'local';

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles['chip']}>
            {isLocal ? (
              <Monitor size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            ) : (
              <Cloud size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            )}
            <span>{environmentChipLabel(draft.environment, draft.networkAccess)}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-72">
          {local.supported && (
            <>
              <DropdownMenuLabel>{CODE_COPY.environmentLocal}</DropdownMenuLabel>
              <LocalFolderItems
                local={local}
                selectedRootId={isLocal ? draft.localRootId : null}
                onDraftChange={onDraftChange}
                onCloseMenu={() => setMenuOpen(false)}
              />
              <DropdownMenuSeparator />
              {local.worktrees && (
                <>
                  <DropdownMenuLabel>{LOCAL_PLACEMENT_HEADING}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={local.placement}
                    onValueChange={(value) => {
                      const placement = LOCAL_PLACEMENTS.find((candidate) => candidate === value);
                      if (placement) local.onPlacementChange(placement);
                    }}
                  >
                    {LOCAL_PLACEMENTS.map((placement) => (
                      <DropdownMenuRadioItem key={placement} value={placement}>
                        <span className={styles['menuRowLabel']}>
                          <span className={styles['optionLabel']}>
                            {LOCAL_PLACEMENT_LABELS[placement]}
                          </span>
                          <span className={styles['optionCopy']}>
                            {LOCAL_PLACEMENT_HINTS[placement]}
                          </span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                </>
              )}
            </>
          )}

          <DropdownMenuLabel>{CODE_COPY.environmentCloud}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={isLocal ? '' : draft.networkAccess}
            onValueChange={(value) =>
              onDraftChange({
                environment: 'cloud',
                networkAccess: value as CloudCodeNetworkAccess,
                ...(value === 'full' ? {} : { fullNetworkAccepted: false }),
              })
            }
          >
            {CODE_NETWORK_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                <span className={styles['menuRowLabel']}>
                  <span className={styles['optionLabel']}>{option.label}</span>
                  <span className={styles['optionCopy']}>{option.description}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          {/* Radix restores focus as the menu closes, which cancels a dialog
              opened in the same tick, so the select is prevented and the menu is
              dismissed here instead of by Radix. */}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setMenuOpen(false);
              setSettingsOpen(true);
            }}
          >
            <span className={styles['menuRowLabel']}>{CODE_COPY.editEnvironment}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{CODE_COPY.editEnvironment}</DialogTitle>
          </DialogHeader>
          <EnvironmentSettings
            draft={draft}
            runtimes={runtimes}
            harnessModels={harnessModels}
            disabled={disabled}
            onDraftChange={onDraftChange}
            onOpenEmpty={() => {
              setSettingsOpen(false);
              onOpenEmpty();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RepositoryFirstRun() {
  const steps = [
    { id: 'connect', title: CODE_COPY.firstRunConnectTitle, copy: CODE_COPY.firstRunConnectCopy },
    { id: 'install', title: CODE_COPY.firstRunInstallTitle, copy: CODE_COPY.firstRunInstallCopy },
  ];

  return (
    <div className={styles['checklist']}>
      <span className={styles['popoverHeading']}>{CODE_COPY.firstRunRepositoryHeading}</span>
      <ol className={styles['checklistRows']}>
        {steps.map((step) => (
          <li key={step.id} className={styles['checklistRow']}>
            <span className={styles['checklistGlyph']}>
              <CircleDot size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            </span>
            <span>
              <span className={styles['optionLabel']}>{step.title}</span>
              <span className={styles['optionCopy']}>{step.copy}</span>
            </span>
          </li>
        ))}
      </ol>
      <a className={styles['primaryButton']} href={githubInstallHref()}>
        {CODE_COPY.firstRunAction}
      </a>
    </div>
  );
}

function RepositoryResults({
  state,
  search,
  onSearchChange,
  onChoose,
}: {
  state: CodeRepositoryState;
  search: string;
  onSearchChange: (value: string) => void;
  onChoose: (repository: CloudCodeRepository) => void;
}) {
  const searchFieldId = useId();

  return (
    <>
      <div className={styles['repositoryList']} aria-label={CODE_COPY.repositoryChip}>
        {(state.status === 'loading' || state.status === 'idle') && (
          <div className={styles['repositoryEmpty']}>
            <Spinner size="sm" aria-label={CODE_COPY.repositoryLoading} />
          </div>
        )}

        {state.status === 'ready' && state.repositories.length === 0 && (
          <div className={styles['repositoryEmpty']}>
            <span>
              {search.trim() ? CODE_COPY.repositoryNoMatches : CODE_COPY.repositoryNoneReachable}
            </span>
            {!search.trim() && (
              <a
                className={styles['secondaryButton']}
                href={CODE_ROUTES.githubManageInstallations}
                target="_blank"
                rel="noopener noreferrer"
              >
                {CODE_COPY.repositoryManageAccess}
              </a>
            )}
          </div>
        )}

        {state.status === 'ready' &&
          state.repositories.map((repository) => (
            <button
              key={`${repository.installationId}:${repository.fullName}`}
              type="button"
              className={styles['repositoryRow']}
              onClick={() => onChoose(repository)}
            >
              <Code2 size={CHIP_GLYPH_SIZE} aria-hidden="true" />
              <span className={styles['repositoryName']}>{repository.fullName}</span>
              {repository.isPrivate && (
                <Lock
                  size={CHIP_GLYPH_SIZE}
                  className={styles['repositoryPrivate']}
                  aria-label={CODE_COPY.repositoryPrivate}
                />
              )}
            </button>
          ))}
      </div>

      {state.status === 'ready' && state.truncated && (
        <span className={styles['formHelp']}>{CODE_COPY.repositoryTruncated}</span>
      )}

      {state.status === 'ready' && state.unreachable.length > 0 && (
        <span className={styles['formHelp']}>
          {`${CODE_COPY.repositoryUnreachablePrefix} ${state.unreachable.join(', ')}`}
        </span>
      )}

      <div className={styles['repositorySearch']}>
        <Search size={CHIP_GLYPH_SIZE} aria-hidden="true" />
        <input
          id={searchFieldId}
          className={styles['repositorySearchInput']}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={CODE_COPY.repositorySearchPlaceholder}
          aria-label={CODE_COPY.repositorySearchLabel}
        />
      </div>
    </>
  );
}

function RepositoryConnection({ state }: { state: CodeRepositoryState }) {
  if (state.status === 'unconfigured') {
    return (
      <div className={styles['checklist']}>
        <span className={styles['popoverHeading']}>{CODE_COPY.githubUnconfiguredTitle}</span>
        <span className={styles['optionCopy']}>{CODE_COPY.githubUnconfiguredCopy}</span>
      </div>
    );
  }
  if (state.status === 'linking-unavailable') {
    return (
      <div className={styles['checklist']}>
        <span className={styles['popoverHeading']}>{CODE_COPY.githubLinkingUnavailableTitle}</span>
        <span className={styles['optionCopy']}>{CODE_COPY.githubLinkingUnavailableCopy}</span>
      </div>
    );
  }
  if (state.status === 'authorization-pending') {
    return (
      <div className={styles['checklist']}>
        <span className={styles['popoverHeading']}>
          {CODE_COPY.githubAuthorizationPendingTitle}
        </span>
        <span className={styles['optionCopy']}>{CODE_COPY.githubAuthorizationPendingCopy}</span>
        <a className={styles['primaryButton']} href={githubInstallHref()}>
          {CODE_COPY.githubAuthorizationPendingAction}
        </a>
      </div>
    );
  }
  if (state.status === 'reauthorization-required') {
    return (
      <div className={styles['checklist']}>
        <span className={styles['popoverHeading']}>{CODE_COPY.githubReauthorizeTitle}</span>
        <span className={styles['optionCopy']}>{CODE_COPY.githubReauthorizeCopy}</span>
        <a className={styles['primaryButton']} href={githubInstallHref()}>
          {CODE_COPY.githubReauthorizeAction}
        </a>
      </div>
    );
  }
  return null;
}

function RepositoryPicker({
  draft,
  onDraftChange,
  onEntryChange,
  open,
  onOpenChange,
  trigger,
  api,
}: {
  draft: CodeDraft;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onEntryChange: (entry: CodeRepositoryEntry) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  api: CloudCodeApi;
}) {
  const [url, setUrl] = useState(draft.repositoryUrl);
  const [branch, setBranch] = useState(draft.repositoryBranch);
  const [search, setSearch] = useState('');
  const [urlMode, setUrlMode] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const urlFieldId = useId();
  const branchFieldId = useId();
  const selected = draftHasRepository(draft);
  const { state, reload } = useCodeRepositories(open, search, api);
  const promoting = draft.networkAccess === 'none';
  const urlOnly =
    state.status === 'error' ||
    state.status === 'unconfigured' ||
    state.status === 'linking-unavailable';
  const showUrlFields = urlMode || urlOnly;
  const showResults =
    !urlMode && (state.status === 'idle' || state.status === 'loading' || state.status === 'ready');

  const remember = (nextUrl: string, nextBranch: string) => {
    onEntryChange({ url: nextUrl, branch: nextBranch });
  };

  const promote = () =>
    draft.networkAccess === 'none' ? { networkAccess: REPOSITORY_MINIMUM_NETWORK_ACCESS } : {};

  const apply = () => {
    const nextUrl = url.trim();
    const parsedUrl = nextUrl ? canonicalGitHubRepositoryUrl(nextUrl) : null;
    if (parsedUrl && !parsedUrl.ok) {
      setEntryError(CODE_COPY.repositoryUrlInvalid);
      return;
    }
    const parsedBranch = canonicalGitHubRepositoryBranch(branch);
    if (!parsedBranch.ok) {
      setEntryError(CODE_COPY.repositoryBranchInvalid);
      return;
    }
    setEntryError(null);
    const canonical = parsedUrl?.ok ? parsedUrl.url : '';
    remember(canonical, parsedBranch.branch ?? '');
    onDraftChange({
      repository: null,
      repositoryUrl: canonical,
      repositoryBranch: parsedBranch.branch ?? '',
      ...(canonical ? promote() : {}),
    });
    onOpenChange(false);
  };

  const choose = (repository: CloudCodeRepository) => {
    setUrl('');
    setBranch(repository.defaultBranch ?? '');
    setEntryError(null);
    remember('', repository.defaultBranch ?? '');
    onDraftChange({
      repository: { installationId: repository.installationId, fullName: repository.fullName },
      repositoryUrl: '',
      repositoryBranch: repository.defaultBranch ?? '',
      ...promote(),
    });
    onOpenChange(false);
  };

  const clear = () => {
    setUrl('');
    setBranch('');
    setEntryError(null);
    remember('', '');
    onDraftChange({ repository: null, repositoryUrl: '', repositoryBranch: '' });
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={POPOVER_OFFSET}
        style={{ width: POPOVER_WIDTH }}
        className="p-0"
        aria-label={CODE_COPY.repositoryChip}
      >
        <div className={styles['popover']}>
          {state.status === 'no-installation' && <RepositoryFirstRun />}
          <RepositoryConnection state={state} />

          {state.status === 'error' && (
            <div className={styles['repositoryEmpty']}>
              <span>{CODE_COPY.repositoryLoadFailed}</span>
              <button type="button" className={styles['secondaryButton']} onClick={reload}>
                {CODE_COPY.retry}
              </button>
            </div>
          )}

          {showResults && (
            <RepositoryResults
              state={state}
              search={search}
              onSearchChange={setSearch}
              onChoose={choose}
            />
          )}

          {showUrlFields && (
            <>
              <div className={styles['formField']}>
                <label className={styles['formLabel']} htmlFor={urlFieldId}>
                  {CODE_COPY.repositoryUrlLabel}
                </label>
                <input
                  id={urlFieldId}
                  className={styles['textInput']}
                  value={url}
                  onChange={(event) => {
                    const next = event.target.value;
                    setUrl(next);
                    setEntryError(null);
                    remember(next, branch);
                  }}
                  placeholder={CODE_COPY.repositoryUrlPlaceholder}
                  maxLength={CODE_LIMITS.repositoryUrl}
                />
              </div>
              <div className={styles['formField']}>
                <label className={styles['formLabel']} htmlFor={branchFieldId}>
                  {CODE_COPY.repositoryBranchLabel}
                </label>
                <input
                  id={branchFieldId}
                  className={styles['textInput']}
                  value={branch}
                  onChange={(event) => {
                    const next = event.target.value;
                    setBranch(next);
                    setEntryError(null);
                    remember(url, next);
                  }}
                  placeholder={CODE_COPY.repositoryBranchPlaceholder}
                  maxLength={CODE_LIMITS.repositoryBranch}
                />
              </div>
              {entryError && (
                <span className={styles['formHelp']} role="alert">
                  {entryError}
                </span>
              )}
              <div className={styles['popoverActions']}>
                {selected && (
                  <button type="button" className={styles['secondaryButton']} onClick={clear}>
                    {CODE_COPY.repositoryClear}
                  </button>
                )}
                <button
                  type="button"
                  className={styles['primaryButton']}
                  disabled={url.trim().length === 0}
                  onClick={apply}
                >
                  {CODE_COPY.repositoryApply}
                </button>
              </div>
            </>
          )}

          {promoting && (state.status === 'ready' || showUrlFields) && (
            <span className={styles['formHelp']}>{CODE_COPY.environmentPromotedToTrusted}</span>
          )}

          {!urlOnly && (
            <button
              type="button"
              className={styles['popoverToggle']}
              onClick={() => setUrlMode((current) => !current)}
            >
              {urlMode ? CODE_COPY.repositoryUrlHide : CODE_COPY.repositoryUrlToggle}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BranchChip({
  draft,
  onDraftChange,
  api,
}: {
  draft: CodeDraft;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  api: CloudCodeApi;
}) {
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState(draft.repositoryBranch);
  const [search, setSearch] = useState('');
  const fieldId = useId();
  const searchFieldId = useId();
  const listed = draft.repository !== null;
  const { state, reload } = useCodeBranches(draft.repository, open && listed, api);

  useEffect(() => setBranch(draft.repositoryBranch), [draft.repositoryBranch]);

  const choose = (name: string) => {
    onDraftChange({ repositoryBranch: name });
    setSearch('');
    setOpen(false);
  };

  const apply = () => {
    const next = branch.trim();
    if (!next) return;
    choose(next);
  };

  const needle = search.trim();
  const matches =
    state.status === 'ready'
      ? state.branches.filter((candidate) =>
          candidate.name.toLowerCase().includes(needle.toLowerCase()),
        )
      : [];
  const typedIsListed = matches.some((candidate) => candidate.name === needle);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={styles['chip']} aria-label={CODE_COPY.branchEdit}>
          <GitBranch size={CHIP_GLYPH_SIZE} aria-hidden="true" />
          <span className={CHIP_TEXT_TRUNCATE} title={draft.repositoryBranch}>
            {draft.repositoryBranch}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={POPOVER_OFFSET}
        style={{ width: POPOVER_WIDTH }}
        className="p-0"
        aria-label={CODE_COPY.branchEdit}
      >
        <div className={styles['popover']}>
          {listed ? (
            <>
              <div className={styles['repositoryList']} aria-label={CODE_COPY.branchListLabel}>
                {(state.status === 'loading' || state.status === 'idle') && (
                  <div className={styles['repositoryEmpty']}>
                    <Spinner size="sm" aria-label={CODE_COPY.branchLoading} />
                  </div>
                )}

                {state.status === 'error' && (
                  <div className={styles['repositoryEmpty']}>
                    <span>{CODE_COPY.branchLoadFailed}</span>
                    <button type="button" className={styles['secondaryButton']} onClick={reload}>
                      {CODE_COPY.retry}
                    </button>
                  </div>
                )}

                {state.status === 'ready' && matches.length === 0 && !needle && (
                  <div className={styles['repositoryEmpty']}>
                    <span>{CODE_COPY.branchNoMatches}</span>
                  </div>
                )}

                {matches.map((candidate) => (
                  <button
                    key={candidate.name}
                    type="button"
                    className={styles['repositoryRow']}
                    aria-current={candidate.name === draft.repositoryBranch ? 'true' : undefined}
                    onClick={() => choose(candidate.name)}
                  >
                    <GitBranch size={CHIP_GLYPH_SIZE} aria-hidden="true" />
                    <span className={styles['repositoryName']}>{candidate.name}</span>
                    {candidate.isProtected && (
                      <Lock
                        size={CHIP_GLYPH_SIZE}
                        className={styles['repositoryPrivate']}
                        aria-label={CODE_COPY.branchProtected}
                      />
                    )}
                  </button>
                ))}

                {needle && !typedIsListed && state.status !== 'loading' && (
                  <button
                    type="button"
                    className={styles['repositoryRow']}
                    onClick={() => choose(needle)}
                  >
                    <Plus size={CHIP_GLYPH_SIZE} aria-hidden="true" />
                    <span className={styles['repositoryName']}>
                      {`${CODE_COPY.branchUseTyped} ${needle}`}
                    </span>
                  </button>
                )}
              </div>

              {state.status === 'ready' && state.truncated && (
                <span className={styles['formHelp']}>{CODE_COPY.branchTruncated}</span>
              )}

              <div className={styles['repositorySearch']}>
                <Search size={CHIP_GLYPH_SIZE} aria-hidden="true" />
                <input
                  id={searchFieldId}
                  className={styles['repositorySearchInput']}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (isImeComposingKey(event.nativeEvent)) return;
                    if (event.key !== ENTER_KEY || !needle) return;
                    event.preventDefault();
                    choose(needle);
                  }}
                  placeholder={CODE_COPY.branchSearchPlaceholder}
                  aria-label={CODE_COPY.branchSearchLabel}
                  maxLength={CODE_LIMITS.repositoryBranch}
                />
              </div>
            </>
          ) : (
            <>
              <div className={styles['formField']}>
                <label className={styles['formLabel']} htmlFor={fieldId}>
                  {CODE_COPY.repositoryBranchLabel}
                </label>
                <input
                  id={fieldId}
                  className={styles['textInput']}
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  onKeyDown={(event) => {
                    if (isImeComposingKey(event.nativeEvent)) return;
                    if (event.key !== ENTER_KEY) return;
                    event.preventDefault();
                    apply();
                  }}
                  maxLength={CODE_LIMITS.repositoryBranch}
                />
              </div>
              <div className={styles['popoverActions']}>
                <button
                  type="button"
                  className={styles['primaryButton']}
                  disabled={branch.trim().length === 0}
                  onClick={apply}
                >
                  {CODE_COPY.branchApply}
                </button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LocalBranchChip({
  rootId,
  branch,
  disabled,
  onSwitched,
}: {
  rootId: string;
  branch: string;
  disabled: boolean;
  onSwitched: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchFieldId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBranches(null);
    setError(null);
    listLocalBranches(rootId)
      .then((listed) => {
        if (!cancelled) setBranches(listed?.branches ?? []);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, CODE_COPY.branchLoadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [open, rootId]);

  const choose = async (next: string) => {
    if (next === branch) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    setError(null);
    try {
      await switchLocalBranch(rootId, next);
      onSwitched();
      setOpen(false);
    } catch (cause: unknown) {
      setError(toUserMessage(cause, CODE_COPY.branchSwitchFailed));
    } finally {
      setSwitching(false);
    }
  };

  const needle = search.trim().toLowerCase();
  const matches = (branches ?? []).filter((name) => name.toLowerCase().includes(needle));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={styles['chip']}
          aria-label={CODE_COPY.branchEdit}
          disabled={disabled}
        >
          <GitBranch size={CHIP_GLYPH_SIZE} aria-hidden="true" />
          <span className={CHIP_TEXT_TRUNCATE} title={branch}>
            {branch}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={POPOVER_OFFSET}
        style={{ width: POPOVER_WIDTH }}
        className="p-0"
        aria-label={CODE_COPY.branchEdit}
      >
        <div className={styles['popover']}>
          {error !== null && (
            <span className={styles['formHelp']} role="alert">
              {error}
            </span>
          )}
          <div className={styles['repositoryList']} aria-label={CODE_COPY.branchListLabel}>
            {branches === null && error === null && (
              <div className={styles['repositoryEmpty']}>
                <Spinner size="sm" aria-label={CODE_COPY.branchLoading} />
              </div>
            )}
            {matches.map((name) => (
              <button
                key={name}
                type="button"
                className={styles['repositoryRow']}
                aria-current={name === branch ? 'true' : undefined}
                disabled={switching}
                onClick={() => void choose(name)}
              >
                <GitBranch size={CHIP_GLYPH_SIZE} aria-hidden="true" />
                <span className={styles['repositoryName']}>{name}</span>
              </button>
            ))}
          </div>
          <span className={styles['formHelp']}>{CODE_COPY.branchSwitchHelp}</span>
          <div className={styles['repositorySearch']}>
            <Search size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <input
              id={searchFieldId}
              className={styles['repositorySearchInput']}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={CODE_COPY.branchSearchLabel}
              aria-label={CODE_COPY.branchSearchLabel}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RepositoryChips({
  draft,
  onDraftChange,
  onEntryChange,
  api,
}: {
  draft: CodeDraft;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onEntryChange: (entry: CodeRepositoryEntry) => void;
  api: CloudCodeApi;
}) {
  const [open, setOpen] = useState(false);
  const selected = draftHasRepository(draft);

  if (!selected) {
    return (
      <RepositoryPicker
        draft={draft}
        onDraftChange={onDraftChange}
        onEntryChange={onEntryChange}
        open={open}
        onOpenChange={setOpen}
        api={api}
        trigger={
          <button type="button" className={styles['chip']}>
            <Plus size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span>{CODE_COPY.repositoryChip}</span>
          </button>
        }
      />
    );
  }

  return (
    <>
      <RepositoryPicker
        draft={draft}
        onDraftChange={onDraftChange}
        onEntryChange={onEntryChange}
        open={open}
        onOpenChange={setOpen}
        api={api}
        trigger={
          <button type="button" className={`${styles['chip']} ${styles['chipSet']}`}>
            <Code2 size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span>{draftRepositoryLabel(draft)}</span>
          </button>
        }
      />
      {draft.repositoryBranch && (
        <BranchChip draft={draft} onDraftChange={onDraftChange} api={api} />
      )}
      <button
        type="button"
        className={`${styles['chip']} ${styles['chipCompact']}`}
        aria-label={CODE_COPY.repositoryChange}
        onClick={() => setOpen(true)}
      >
        <Plus size={CHIP_GLYPH_SIZE} aria-hidden="true" />
      </button>
    </>
  );
}

function ApprovalModeControl({
  turnMode,
  onTurnModeChange,
}: {
  turnMode: CloudCodeTurnMode | null;
  onTurnModeChange: (mode: CloudCodeTurnMode) => void;
}) {
  const [policy, setPolicy] = useState<ToolApprovalPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const planning = turnMode === PLAN_TURN_MODE;

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<ToolApprovalPreferences>(
      TOOL_APPROVAL_PREFERENCE_NAMESPACE,
      WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES,
    )
      .then((value) => {
        if (!cancelled) setPolicy(value.defaultPolicy);
      })
      .catch(() => {
        if (!cancelled) setPolicy(DEFAULT_TOOL_APPROVAL_PREFERENCES.defaultPolicy);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: ToolApprovalPolicy) => {
      const previous = policy;
      setPolicy(next);
      setSaving(true);
      try {
        await savePreferenceNamespace<ToolApprovalPreferences>(TOOL_APPROVAL_PREFERENCE_NAMESPACE, {
          defaultPolicy: next,
        });
      } catch {
        setPolicy(previous);
      } finally {
        setSaving(false);
      }
    },
    [policy],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${styles['controlButton']} ${styles['controlButtonMode']}`}
          aria-label={CODE_COPY.approvalMode}
          aria-busy={policy === null}
        >
          {planning ? (
            <span>{CODE_COPY.planMode}</span>
          ) : (
            policy && <span>{toolApprovalPolicyOption(policy).shortLabel}</span>
          )}
          {saving || policy === null ? (
            <Spinner size="sm" aria-label={policy === null ? CODE_COPY.approvalMode : undefined} />
          ) : (
            <ChevronDown size={CHIP_GLYPH_SIZE} aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-80">
        <DropdownMenuLabel>{CODE_COPY.modeMenu}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={planning ? PLAN_TURN_MODE : (policy ?? '')}
          onValueChange={(value) => {
            if (value === PLAN_TURN_MODE) {
              onTurnModeChange(PLAN_TURN_MODE);
              return;
            }
            onTurnModeChange(CLOUD_CODE_DEFAULT_TURN_MODE);
            if (value !== policy) void persist(value as ToolApprovalPolicy);
          }}
        >
          {TOOL_APPROVAL_POLICY_OPTIONS.map((option, index) => (
            <DropdownMenuRadioItem key={option.policy} value={option.policy}>
              <span className={styles['menuRowLabel']}>
                <span className={styles['optionLabel']}>{option.label}</span>
                <span className={styles['optionHint']}>{option.hint}</span>
              </span>
              <DropdownMenuShortcut>{index + FIRST_SHORTCUT}</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
          {turnMode !== null && (
            <DropdownMenuRadioItem value={PLAN_TURN_MODE}>
              <span className={styles['menuRowLabel']}>
                <span className={styles['optionLabel']}>{CODE_COPY.planMode}</span>
                <span className={styles['optionHint']}>{CODE_COPY.planModeHint}</span>
              </span>
              <DropdownMenuShortcut>
                {TOOL_APPROVAL_POLICY_OPTIONS.length + FIRST_SHORTCUT}
              </DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DEVELOPER_SETTINGS_SECTION = 'local-mcp';

function AttachMenu({
  onAddImages,
  imagesDisabled,
}: {
  onAddImages?: () => void;
  imagesDisabled?: boolean;
}) {
  const localMcp = useDeveloperCapabilities().has('mcp_servers');
  const { openSettings } = useSettingsModal();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={styles['controlIconButton']}
          aria-label={CODE_COPY.attachMenu}
        >
          <Plus size={CONTROL_GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        {onAddImages && (
          <DropdownMenuItem disabled={imagesDisabled} onSelect={onAddImages}>
            <ImagePlus size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span className={styles['menuRowLabel']}>{LOCAL_CODE_COPY.addImages}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={CODE_ROUTES.connectors}>
            <Plug size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span className={styles['menuRowLabel']}>{CODE_COPY.addConnectors}</span>
          </Link>
        </DropdownMenuItem>
        {localMcp && (
          <DropdownMenuItem onSelect={() => openSettings(DEVELOPER_SETTINGS_SECTION)}>
            <Terminal size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span className={styles['menuRowLabel']}>{CODE_COPY.mcpServers}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UsageRing({
  contextTokens,
  contextWindow,
}: {
  contextTokens: number | null;
  contextWindow: number | null;
}) {
  const router = useGuardedRouter();
  const { usage, loading } = useManagedUsageSummary();
  const planTier = usage?.plan_tier ?? null;
  const freePlan = isFreeBillingPlanTier(planTier);
  const metered = usage !== null && isBillingPlanTier(planTier) && !freePlan;
  const percent = metered ? Math.min(PERCENT_MAX, Math.max(0, usage.usage_percentage ?? 0)) : 0;
  const now = Date.now();

  const bars = metered
    ? [
        {
          id: 'session',
          label: CODE_COPY.usageSession,
          percent: usage.session_usage_percentage,
          resetAt: usage.session_reset_at,
        },
        {
          id: 'weekly',
          label: CODE_COPY.usageWeekly,
          percent: usage.weekly_usage_percentage,
          resetAt: usage.weekly_reset_at,
        },
        {
          id: 'flagship',
          label: CODE_COPY.usageFlagship,
          percent: usage.flagship_weekly_usage_percentage,
          resetAt: usage.flagship_weekly_reset_at,
        },
      ].filter((bar) => typeof bar.percent === 'number')
    : [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={styles['usageTrigger']} aria-label={CODE_COPY.usageMenu}>
          <svg
            width={USAGE_RING_SIZE}
            height={USAGE_RING_SIZE}
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <circle
              cx="8"
              cy="8"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={USAGE_RING_STROKE}
              opacity="0.25"
            />
            <circle
              cx="8"
              cy="8"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={USAGE_RING_STROKE}
              strokeDasharray={`${(percent / PERCENT_MAX) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeLinecap="round"
              transform="rotate(-90 8 8)"
            />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={POPOVER_OFFSET} className="w-72 p-0">
        <div className={styles['popover']}>
          {contextTokens !== null && contextWindow !== null && (
            <div className={styles['usageBarBlock']}>
              <div className={styles['usageBarLabel']}>
                <span>{CODE_COPY.contextWindow}</span>
                <span>{contextWindowLabel(contextTokens, contextWindow)}</span>
              </div>
              <div className={styles['usageBarTrack']}>
                <div
                  className={styles['usageBarFill']}
                  style={{
                    width: `${Math.min(PERCENT_MAX, (contextTokens / contextWindow) * PERCENT_MAX)}%`,
                  }}
                />
              </div>
            </div>
          )}
          {loading && <Spinner size="sm" aria-label={CODE_COPY.usageMenu} />}
          {!loading && freePlan && (
            <button
              type="button"
              className={styles['primaryButton']}
              onClick={() => openUpgrade((href) => router.push(href))}
            >
              {CODE_COPY.upgradeAction}
            </button>
          )}
          {!freePlan && <span className={styles['popoverHeading']}>{CODE_COPY.planUsage}</span>}
          {!loading && !freePlan && bars.length === 0 && (
            <span className={styles['formHelp']}>{CODE_COPY.usageUnavailable}</span>
          )}
          {bars.map((bar) => {
            const resetIn = formatResetIn(bar.resetAt, now);
            return (
              <div key={bar.id} className={styles['usageBarBlock']}>
                <div className={styles['usageBarLabel']}>
                  <span>{bar.label}</span>
                  <span>{`${Math.round(bar.percent ?? 0)}%`}</span>
                </div>
                <div className={styles['usageBarTrack']}>
                  <div
                    className={styles['usageBarFill']}
                    style={{ width: `${Math.min(PERCENT_MAX, bar.percent ?? 0)}%` }}
                  />
                </div>
                {resetIn && <span className={styles['formHelp']}>{resetIn}</span>}
              </div>
            );
          })}
          {metered && (
            <Link className={styles['usageLink']} href={CODE_ROUTES.usage}>
              <span>{CODE_COPY.usageDetail}</span>
              <ChevronRight size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CodeUsageWarning() {
  const router = useGuardedRouter();
  const { usage } = useManagedUsageSummary();
  const [dismissed, setDismissed] = useState(false);
  const warning = useMemo(
    () =>
      selectUsageWarning(readManagedUsageBuckets(usage), Date.now(), {
        planTier: usage?.plan_tier ?? null,
      }),
    [usage],
  );

  return (
    <UsageWarningBanner
      warning={dismissed ? null : warning}
      {...(isFreeBillingPlanTier(usage?.plan_tier)
        ? { upgradeLabel: CODE_COPY.upgradeAction }
        : {})}
      onUpgrade={() => openUpgrade((href) => router.push(href))}
      onDismiss={() => setDismissed(true)}
    />
  );
}

export interface CodeComposerProps {
  dictationDestination: string | null;
  dictationModel: string | null;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string, repository: CodeRepositoryEntry | null, pictures?: File[]) => void;
  onSubmitInBackground?: (
    text: string,
    repository: CodeRepositoryEntry | null,
    pictures: File[],
  ) => Promise<boolean>;
  startBlockedBy?: string | undefined;
  disabled: boolean;
  busy: boolean;
  showChips: boolean;
  showHint: boolean;
  onDismissHint: () => void;
  draft: CodeDraft;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onOpenEmptyEnvironment: () => void;
  runtimes: CloudCodeRuntime[];
  harnessModels?: readonly HarnessModelChoice[];
  local: CodeLocalState;
  api: CloudCodeApi;
  turnRunning: boolean;
  stopping: boolean;
  onStop: () => void;
  contextTokens: number | null;
  contextWindow: number | null;
  turnControls: boolean;
  turnMode: CloudCodeTurnMode;
  onTurnModeChange: (mode: CloudCodeTurnMode) => void;
}

export function CodeComposer({
  dictationDestination,
  dictationModel,
  value,
  onChange,
  onSubmit,
  onSubmitInBackground,
  startBlockedBy,
  disabled,
  busy,
  showChips,
  showHint,
  onDismissHint,
  draft,
  onDraftChange,
  onOpenEmptyEnvironment,
  runtimes,
  harnessModels,
  local,
  api,
  turnRunning,
  stopping,
  onStop,
  contextTokens,
  contextWindow,
  turnControls,
  turnMode,
  onTurnModeChange,
}: CodeComposerProps) {
  const [focused, setFocused] = useState(false);
  const [pointerFocused, setPointerFocused] = useState(false);
  const folder = local.folders.find((choice) => choice.rootId === draft.localRootId) ?? null;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusComposerAfterSend = useRef(false);
  const imagePicker = useRef<HTMLInputElement>(null);
  const repositoryEntry = useRef<CodeRepositoryEntry>({ url: '', branch: '' });
  const localDraft = showChips && draft.environment === 'local';
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const images = useCodeImages(
    busy
      ? LOCAL_CODE_COPY.imagesWhileStarting
      : folder === null
        ? LOCAL_CODE_COPY.imagesRequireFolder
        : null,
    setImageNotice,
  );
  const imageScope = localDraft
    ? JSON.stringify([draft.localRootId, local.modelId, local.placement])
    : null;
  const previousImageScope = useRef(imageScope);
  const { clearAll, preparing, attachments } = images;
  useLayoutEffect(() => {
    if (previousImageScope.current === imageScope) return;
    previousImageScope.current = imageScope;
    clearAll();
    setImageNotice(
      attachments.length > 0 || preparing ? LOCAL_CODE_COPY.imagesDestinationChanged : null,
    );
  }, [imageScope, clearAll, attachments.length, preparing]);
  const hasDraft = value.trim().length > 0 || (localDraft && images.attachments.length > 0);
  const maySubmit = !disabled && !startBlockedBy && !busy && !images.preparing;
  const sendable = hasDraft && maySubmit;
  const enteredRepository = () => {
    const url = repositoryEntry.current.url.trim();
    return url ? { url, branch: repositoryEntry.current.branch } : null;
  };
  const submitTask = (text: string) => {
    if (!maySubmit) return;
    const repository = enteredRepository();
    if (localDraft && images.attachments.length > 0) {
      onSubmit(text, repository, images.attachments);
    } else {
      onSubmit(text, repository);
    }
  };
  const submitInBackground = async () => {
    if (!sendable || !onSubmitInBackground) return;
    if (await onSubmitInBackground(value.trim(), enteredRepository(), images.attachments)) {
      clearAll();
    }
  };
  const cloudTurn = !showChips || draft.environment === 'cloud';
  const dictationDestinationReady = Boolean(
    cloudTurn &&
    dictationDestination &&
    dictationModel &&
    getProviderModeForModel(dictationModel) === 'ManagedGateway',
  );
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);
  const dictationSwitchedOff = useBillingStore((state) =>
    dictationSwitchedOffReason(state.disabledFeatures),
  );
  const dictationUnavailableReason =
    dictationSwitchedOff ??
    (!dictationEnabled ? DICTATION_DISABLED_IN_SETTINGS : undefined) ??
    (!dictationDestinationReady ? CODE_COPY.dictationRequiresCloud : undefined);
  const dictation = useDictation({
    scope: JSON.stringify([
      dictationDestination,
      dictationModel,
      draft.environment,
      draft.localRootId,
      draft.localModelId,
      draft.runtimeId,
      draft.harnessModelId,
    ]),
    isAvailable: () => dictationDestinationReady && !disabled && !busy,
    onInsert: (text) => onChange(value ? `${value} ${text}` : text),
    onSend: (text) => {
      const next = value ? `${value} ${text}` : text;
      onChange(next);
      if (next.trim()) submitTask(next.trim());
    },
  });
  const startDictation = dictation.start;
  const router = useGuardedRouter();
  const requestUpgrade = () => openUpgrade((href) => router.push(href));
  const [commandIndex, setCommandIndex] = useState(0);
  const [dismissedCommandQuery, setDismissedCommandQuery] = useState<string | null>(null);
  const commandQuery = cloudTurn && COMMAND_QUERY.test(value) ? value.toLowerCase() : null;
  const commandSuggestions: CommandSuggestion[] =
    commandQuery === null || commandQuery === dismissedCommandQuery
      ? []
      : CLOUD_CODE_GOAL_COMMANDS.filter((command) => command.startsWith(commandQuery)).map(
          (command) => ({
            id: command,
            command,
            description: CODE_GOAL_COMMAND_DESCRIPTIONS[command],
          }),
        );
  const commandsOpen = focused && commandSuggestions.length > 0;
  const composerShortcuts = onSubmitInBackground
    ? `${ENTER_KEY} ${SEND_AND_STAY_SHORTCUTS}`
    : ENTER_KEY;

  useEffect(() => setCommandIndex(0), [commandQuery]);

  const chooseCommand = (suggestion: CommandSuggestion) => {
    onChange(`${suggestion.command} `);
    setDismissedCommandQuery(null);
  };

  const handleCommandKey = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!commandsOpen) return false;
    const count = commandSuggestions.length;
    if (event.key === 'ArrowDown') setCommandIndex((index) => (index + 1) % count);
    else if (event.key === 'ArrowUp') setCommandIndex((index) => (index - 1 + count) % count);
    else if (event.key === ENTER_KEY || event.key === 'Tab') {
      const suggestion = commandSuggestions[commandIndex];
      if (suggestion) chooseCommand(suggestion);
    } else if (event.key === 'Escape') setDismissedCommandQuery(commandQuery);
    else return false;
    event.preventDefault();
    return true;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isImeComposingKey(event.nativeEvent)) return;
    if (handleCommandKey(event)) return;
    if (event.key !== ENTER_KEY || event.shiftKey) return;
    event.preventDefault();
    if (!sendable) return;
    if (onSubmitInBackground && (event.metaKey || event.ctrlKey)) void submitInBackground();
    else submitTask(value.trim());
  };

  return (
    <div className={styles['composerArea']} data-testid="code-composer-area">
      <div className={styles['center']}>
        {showHint && (
          <div className={styles['hint']}>
            <Lightbulb size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span className={styles['hintText']}>{CODE_COPY.firstRunHint}</span>
            <button
              type="button"
              className={styles['controlIconButton']}
              aria-label={CODE_COPY.dismissHint}
              onClick={onDismissHint}
            >
              <X size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            </button>
          </div>
        )}

        <CodeUsageWarning />

        {imageNotice && (
          <div className={styles['notice']} role="status">
            {imageNotice}
          </div>
        )}
        <div
          id="chat-composer"
          data-testid="code-composer-field"
          className={styles['field']}
          {...(localDraft ? images.dropTarget : {})}
        >
          {localDraft && images.previews.length > 0 && (
            <AttachmentPreview
              previews={images.previews}
              onRemove={images.removeFile}
              disableRemove={busy}
            />
          )}
          <SlashCommandMenu
            show={commandsOpen}
            suggestions={commandSuggestions}
            selectedIndex={commandIndex}
            onSelect={chooseCommand}
            onHover={setCommandIndex}
          />
          <div className={styles['fieldRow']}>
            {localDraft && folder !== null && (
              <input
                ref={imagePicker}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = '';
                  if (files.length > 0) images.addImages(files);
                }}
              />
            )}
            <AttachMenu
              {...(localDraft
                ? {
                    onAddImages: () => imagePicker.current?.click(),
                    imagesDisabled: disabled || busy || folder === null || !images.canAddMore,
                  }
                : {})}
            />
            <textarea
              ref={inputRef}
              className={styles['input']}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onFocus={() => setFocused(true)}
              onPointerDown={() => setPointerFocused(true)}
              onBlur={() => {
                setFocused(false);
                setPointerFocused(false);
              }}
              onKeyDown={handleKeyDown}
              onPaste={localDraft ? images.onPaste : undefined}
              placeholder={busy ? CODE_COPY.runningPlaceholder : CODE_COPY.composerPlaceholder}
              maxLength={CODE_LIMITS.task}
              disabled={disabled}
              rows={1}
              aria-label={CODE_COPY.composerPlaceholder}
              aria-keyshortcuts={sendable && !commandsOpen ? composerShortcuts : undefined}
              data-composer-textarea
              data-pointer-focused={pointerFocused || undefined}
              aria-describedby={startBlockedBy}
            />
            {turnRunning ? (
              <button
                type="button"
                className={styles['sendButton']}
                disabled={stopping}
                aria-label={stopping ? CODE_COPY.stoppingTurn : CODE_COPY.stopTurn}
                onClick={onStop}
              >
                {stopping ? (
                  <Spinner size="sm" aria-hidden="true" />
                ) : (
                  <Square size={SEND_GLYPH_SIZE} aria-hidden="true" />
                )}
              </button>
            ) : hasDraft ? (
              <>
                {onSubmitInBackground && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={styles['controlIconButton']}
                        disabled={!sendable}
                        aria-label={CODE_COPY.sendOptions}
                        title={CODE_COPY.sendOptions}
                      >
                        <ChevronDown size={CHIP_GLYPH_SIZE} aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      side="top"
                      onCloseAutoFocus={(event) => {
                        if (!focusComposerAfterSend.current) return;
                        focusComposerAfterSend.current = false;
                        event.preventDefault();
                        inputRef.current?.focus();
                      }}
                    >
                      <DropdownMenuItem onSelect={() => submitTask(value.trim())}>
                        {CODE_COPY.send}
                        <DropdownMenuShortcut className="whitespace-nowrap ps-3" aria-hidden="true">
                          Enter
                        </DropdownMenuShortcut>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        aria-keyshortcuts={SEND_AND_STAY_SHORTCUTS}
                        onSelect={() => {
                          focusComposerAfterSend.current = true;
                          void submitInBackground();
                        }}
                      >
                        {CODE_COPY.sendAndStay}
                        <DropdownMenuShortcut className="whitespace-nowrap ps-3" aria-hidden="true">
                          {safePlatform.isMac() ? '⌘ Enter' : 'Ctrl Enter'}
                        </DropdownMenuShortcut>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <button
                  type="button"
                  className={styles['sendButton']}
                  disabled={!sendable}
                  aria-label={CODE_COPY.send}
                  aria-keyshortcuts="Enter"
                  title={CODE_COPY.send}
                  onClick={() => submitTask(value.trim())}
                >
                  {busy ? (
                    <Spinner size="sm" aria-hidden="true" />
                  ) : (
                    <ArrowUp size={SEND_GLYPH_SIZE} aria-hidden="true" />
                  )}
                </button>
              </>
            ) : null}
            {!dictation.isActive && (
              <button
                type="button"
                className={styles['controlIconButton']}
                aria-label={CODE_COPY.startDictation}
                aria-description={dictationUnavailableReason}
                title={dictationUnavailableReason}
                disabled={disabled || busy || dictationUnavailableReason !== undefined}
                onClick={startDictation}
              >
                <Mic size={CONTROL_GLYPH_SIZE} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className={styles['composerFooter']} data-testid="code-composer-footer">
          {showChips && (
            <div className={styles['chipRow']}>
              {draft.environment === 'local' && folder && (
                <LocalFolderChip folder={folder} local={local} onDraftChange={onDraftChange} />
              )}
              <EnvironmentChip
                draft={draft}
                runtimes={runtimes}
                harnessModels={harnessModels ?? []}
                local={local}
                disabled={disabled || busy}
                onDraftChange={onDraftChange}
                onOpenEmpty={onOpenEmptyEnvironment}
              />
              {draft.environment === 'local' ? (
                folder?.branch && (
                  <LocalBranchChip
                    rootId={folder.rootId}
                    branch={folder.branch}
                    disabled={disabled || busy}
                    onSwitched={local.onBranchSwitched}
                  />
                )
              ) : (
                <RepositoryChips
                  draft={draft}
                  onDraftChange={onDraftChange}
                  onEntryChange={(entry) => {
                    repositoryEntry.current = entry;
                  }}
                  api={api}
                />
              )}
            </div>
          )}
          <div className={styles['controlRow']}>
            {dictation.isActive ? (
              <DictationStrip
                status={dictation.status}
                bars={dictation.bars}
                error={dictation.error}
                reducedMotion={dictation.reducedMotion}
                usageLimited={dictation.usageLimited}
                onCancel={dictation.cancel}
                onStop={dictation.stop}
                onSend={dictation.send}
                onRetry={dictation.retry}
                onUpgrade={requestUpgrade}
              />
            ) : (
              <>
                {draft.environment === 'local' ? (
                  <span
                    className={
                      local.agentMode === 'bypass'
                        ? `${styles['localPermissionHint']} ${styles['controlButtonWarning']}`
                        : styles['localPermissionHint']
                    }
                    title={LOCAL_AGENT_MODE_HINTS[local.agentMode]}
                  >
                    <Lock size={CHIP_GLYPH_SIZE} aria-hidden="true" />
                    {LOCAL_CODE_COPY.agentModeNow(DEVELOPER_AGENT_MODE_LABELS[local.agentMode])}
                  </span>
                ) : (
                  turnControls && (
                    <ApprovalModeControl
                      turnMode={cloudTurn ? turnMode : null}
                      onTurnModeChange={onTurnModeChange}
                    />
                  )
                )}
                <span className={styles['controlSpacer']} />
                {draft.environment === 'local' ? (
                  (local.models.length > 0 || local.setups.length > 0) && (
                    <LocalModelChip
                      choices={local.models}
                      setups={local.setups}
                      selected={local.modelId}
                      unreachable={local.modelUnreachable}
                      disabled={busy}
                      onSelect={local.onModelChange}
                    />
                  )
                ) : (
                  <ComposerFooter
                    inline
                    showStyleSelector={false}
                    onUpgradeRequest={requestUpgrade}
                  />
                )}
                <UsageRing contextTokens={contextTokens} contextWindow={contextWindow} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
