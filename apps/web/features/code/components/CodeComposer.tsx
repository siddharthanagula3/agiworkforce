'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Code2,
  GitBranch,
  Mic,
  Plug,
  Plus,
  Square,
  X,
} from '@agiworkforce/icons';
import { Cloud, Lightbulb, Monitor } from 'lucide-react';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from '@agiworkforce/ui';
import type { CloudCodeNetworkAccess, CloudCodeRuntime } from '@agiworkforce/types';
import Link from 'next/link';
import { ComposerFooter } from '@features/chat/components/Composer/ComposerFooter';
import { DictationStrip } from '@features/chat/components/Composer/DictationStrip';
import { useDictation } from '@features/chat/hooks/use-dictation';
import { useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import {
  DEFAULT_TOOL_APPROVAL_PREFERENCES,
  TOOL_APPROVAL_POLICY_OPTIONS,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
  type ToolApprovalPreferences,
} from '@shared/types/toolApprovalPolicy';
import {
  CODE_COPY,
  CODE_LIMITS,
  CODE_NETWORK_OPTIONS,
  CODE_ROUTES,
  DEFAULT_NETWORK_ACCESS,
  DEFAULT_RUNTIME_ID,
  REPOSITORY_MINIMUM_NETWORK_ACCESS,
  formatResetIn,
  networkAccessLabel,
  repositoryLabel,
} from '../code-surface';
import { describeRuntime, runtimeHelpText } from '../code-runtime';
import styles from '../CloudCodePage.module.css';

const CHIP_GLYPH_SIZE = 14;
const CONTROL_GLYPH_SIZE = 16;
const SEND_GLYPH_SIZE = 16;
const POPOVER_WIDTH = 320;
const POPOVER_OFFSET = 8;
const ENTER_KEY = 'Enter';
const FIRST_SHORTCUT = 1;
const USAGE_RING_SIZE = 16;
const USAGE_RING_STROKE = 3;
const RING_RADIUS = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PERCENT_MAX = 100;

export interface CodeDraft {
  networkAccess: CloudCodeNetworkAccess;
  fullNetworkAccepted: boolean;
  extraHosts: string;
  runtimeId: string;
  repositoryUrl: string;
  repositoryBranch: string;
}

export const EMPTY_CODE_DRAFT: CodeDraft = {
  networkAccess: DEFAULT_NETWORK_ACCESS,
  fullNetworkAccepted: false,
  extraHosts: '',
  runtimeId: DEFAULT_RUNTIME_ID,
  repositoryUrl: '',
  repositoryBranch: '',
};

function EnvironmentSettings({
  draft,
  runtimes,
  disabled,
  onDraftChange,
  onOpenEmpty,
}: {
  draft: CodeDraft;
  runtimes: CloudCodeRuntime[];
  disabled: boolean;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onOpenEmpty?: () => void;
}) {
  const runtimeFieldId = useId();
  const runtimeHelpId = `${runtimeFieldId}-help`;
  const extraHostsFieldId = useId();
  const extraHostsHelpId = `${extraHostsFieldId}-help`;
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
          onChange={(event) => onDraftChange({ runtimeId: event.target.value })}
          disabled={runtimes.length === 0}
        >
          <option value={DEFAULT_RUNTIME_ID}>{CODE_COPY.defaultRuntimeOption}</option>
          {harnesses.length > 0 && (
            <optgroup label={CODE_COPY.harnessGroup}>
              {harnesses.map((runtime) => (
                <option key={runtime.id} value={runtime.id}>
                  {describeRuntime(runtime)}
                </option>
              ))}
            </optgroup>
          )}
          {images.length > 0 && (
            <optgroup label={CODE_COPY.imageGroup}>
              {images.map((runtime) => (
                <option key={runtime.id} value={runtime.id}>
                  {describeRuntime(runtime)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span className={styles['formHelp']} id={runtimeHelpId}>
          {runtimeHelpText(runtimes.length, selectedRuntime)}
        </span>
      </div>

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

function EnvironmentChip({
  draft,
  runtimes,
  disabled,
  onDraftChange,
  onOpenEmpty,
}: {
  draft: CodeDraft;
  runtimes: CloudCodeRuntime[];
  disabled: boolean;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onOpenEmpty: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles['chip']}>
            <Cloud size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span>{networkAccessLabel(draft.networkAccess)}</span>
          </button>
        </DropdownMenuTrigger>
        {/* One level rather than the reference's Cloud submenu: the three cloud
            tiers are the only rows this surface can act on, and the desktop rows
            below them are links. A submenu would bury the working rows. */}
        <DropdownMenuContent align="start" side="top" className="w-72">
          <DropdownMenuLabel>{CODE_COPY.environmentCloud}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={draft.networkAccess}
            onValueChange={(value) =>
              onDraftChange({
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

          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={CODE_ROUTES.desktop}>
              <Monitor size={CHIP_GLYPH_SIZE} aria-hidden="true" />
              <span className={styles['menuRowLabel']}>{CODE_COPY.environmentLocal}</span>
              <DropdownMenuShortcut>{CODE_COPY.environmentLocalHint}</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={CODE_ROUTES.desktop}>
              <Monitor size={CHIP_GLYPH_SIZE} aria-hidden="true" />
              <span className={styles['menuRowLabel']}>{CODE_COPY.environmentRemote}</span>
              <DropdownMenuShortcut>{CODE_COPY.environmentRemoteHint}</DropdownMenuShortcut>
            </Link>
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

function RepositoryPicker({
  draft,
  onDraftChange,
  open,
  onOpenChange,
  trigger,
}: {
  draft: CodeDraft;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}) {
  const [url, setUrl] = useState(draft.repositoryUrl);
  const [branch, setBranch] = useState(draft.repositoryBranch);
  const urlFieldId = useId();
  const branchFieldId = useId();
  const selected = draft.repositoryUrl.trim().length > 0;
  const promoting = url.trim().length > 0 && draft.networkAccess === 'none';

  const apply = () => {
    const nextUrl = url.trim();
    onDraftChange({
      repositoryUrl: nextUrl,
      repositoryBranch: nextUrl ? branch.trim() : '',
      ...(nextUrl && draft.networkAccess === 'none'
        ? { networkAccess: REPOSITORY_MINIMUM_NETWORK_ACCESS }
        : {}),
    });
    onOpenChange(false);
  };

  const clear = () => {
    setUrl('');
    setBranch('');
    onDraftChange({ repositoryUrl: '', repositoryBranch: '' });
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
          <div className={styles['formField']}>
            <label className={styles['formLabel']} htmlFor={urlFieldId}>
              {CODE_COPY.repositoryUrlLabel}
            </label>
            <input
              id={urlFieldId}
              className={styles['textInput']}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
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
              onChange={(event) => setBranch(event.target.value)}
              placeholder={CODE_COPY.repositoryBranchPlaceholder}
              maxLength={CODE_LIMITS.repositoryBranch}
            />
          </div>
          {promoting && (
            <span className={styles['formHelp']}>{CODE_COPY.environmentPromotedToTrusted}</span>
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
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RepositoryChips({
  draft,
  onDraftChange,
}: {
  draft: CodeDraft;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = draft.repositoryUrl.trim().length > 0;

  if (!selected) {
    return (
      <RepositoryPicker
        draft={draft}
        onDraftChange={onDraftChange}
        open={open}
        onOpenChange={setOpen}
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
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button type="button" className={`${styles['chip']} ${styles['chipSet']}`}>
            <Code2 size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span>{repositoryLabel(draft.repositoryUrl)}</span>
          </button>
        }
      />
      {draft.repositoryBranch && (
        <span className={`${styles['chip']} ${styles['chipStatic']}`}>
          <GitBranch size={CHIP_GLYPH_SIZE} aria-hidden="true" />
          <span>{draft.repositoryBranch}</span>
        </span>
      )}
      <button
        type="button"
        className={`${styles['chip']} ${styles['chipCompact']}`}
        aria-label={CODE_COPY.repositoryAdd}
        onClick={() => setOpen(true)}
      >
        <Plus size={CHIP_GLYPH_SIZE} aria-hidden="true" />
      </button>
    </>
  );
}

function ApprovalModeControl() {
  const [policy, setPolicy] = useState<ToolApprovalPolicy>(
    DEFAULT_TOOL_APPROVAL_PREFERENCES.defaultPolicy,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<ToolApprovalPreferences>(
      TOOL_APPROVAL_PREFERENCE_NAMESPACE,
      DEFAULT_TOOL_APPROVAL_PREFERENCES,
    )
      .then((value) => {
        if (!cancelled) setPolicy(value.defaultPolicy);
      })
      .catch(() => undefined);
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
          className={styles['controlButton']}
          aria-label={CODE_COPY.approvalMode}
        >
          <span>{toolApprovalPolicyOption(policy).shortLabel}</span>
          {saving ? (
            <Spinner size="sm" aria-hidden="true" />
          ) : (
            <ChevronDown size={CHIP_GLYPH_SIZE} aria-hidden="true" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-80">
        <DropdownMenuLabel>{CODE_COPY.modeMenu}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={policy}
          onValueChange={(value) => void persist(value as ToolApprovalPolicy)}
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
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AttachMenu() {
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
        <DropdownMenuItem asChild>
          <Link href={CODE_ROUTES.connectors}>
            <Plug size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            <span className={styles['menuRowLabel']}>{CODE_COPY.addConnectors}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UsageRing() {
  const { usage, loading } = useManagedUsageSummary();
  const percent = Math.min(PERCENT_MAX, Math.max(0, usage?.usage_percentage ?? 0));
  const now = Date.now();

  const bars = usage
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
          <span className={styles['popoverHeading']}>{CODE_COPY.planUsage}</span>
          {loading && <Spinner size="sm" aria-label={CODE_COPY.usageMenu} />}
          {!loading && bars.length === 0 && (
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
          <Link className={styles['usageLink']} href={CODE_ROUTES.usage}>
            <span>{CODE_COPY.usageDetail}</span>
            <ChevronRight size={CHIP_GLYPH_SIZE} aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface CodeComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled: boolean;
  busy: boolean;
  showChips: boolean;
  showHint: boolean;
  onDismissHint: () => void;
  draft: CodeDraft;
  onDraftChange: (patch: Partial<CodeDraft>) => void;
  onOpenEmptyEnvironment: () => void;
  runtimes: CloudCodeRuntime[];
}

export function CodeComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  showChips,
  showHint,
  onDismissHint,
  draft,
  onDraftChange,
  onOpenEmptyEnvironment,
  runtimes,
}: CodeComposerProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation({
    onInsert: (text) => onChange(value ? `${value} ${text}` : text),
    onSend: (text) => {
      const next = value ? `${value} ${text}` : text;
      onChange(next);
      if (next.trim()) onSubmit(next.trim());
    },
  });

  const sendable = value.trim().length > 0 && !disabled && !busy;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== ENTER_KEY || event.shiftKey) return;
    event.preventDefault();
    if (sendable) onSubmit(value.trim());
  };

  return (
    <div className={styles['composerArea']}>
      <div className={styles['center']}>
        {showChips && (
          <div className={styles['chipRow']}>
            <EnvironmentChip
              draft={draft}
              runtimes={runtimes}
              disabled={disabled || busy}
              onDraftChange={onDraftChange}
              onOpenEmpty={onOpenEmptyEnvironment}
            />
            <RepositoryChips draft={draft} onDraftChange={onDraftChange} />
          </div>
        )}

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

        <div className={`${styles['field']} ${focused ? styles['fieldFocused'] : ''}`}>
          <div className={styles['fieldRow']}>
            <textarea
              ref={inputRef}
              className={styles['input']}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder={busy ? CODE_COPY.runningPlaceholder : CODE_COPY.composerPlaceholder}
              maxLength={CODE_LIMITS.task}
              disabled={disabled}
              rows={1}
              aria-label={CODE_COPY.composerPlaceholder}
            />
            <button
              type="button"
              className={styles['sendButton']}
              disabled={!sendable}
              aria-label={CODE_COPY.send}
              onClick={() => onSubmit(value.trim())}
            >
              {busy ? (
                <Spinner size="sm" aria-hidden="true" />
              ) : (
                <ArrowUp size={SEND_GLYPH_SIZE} aria-hidden="true" />
              )}
            </button>
          </div>

          <div className={styles['controlRow']}>
            {dictation.isActive ? (
              <DictationStrip
                status={dictation.status}
                bars={dictation.bars}
                error={dictation.error}
                reducedMotion={dictation.reducedMotion}
                onCancel={dictation.cancel}
                onStop={dictation.stop}
                onSend={dictation.send}
                onRetry={dictation.retry}
              />
            ) : (
              <>
                <ApprovalModeControl />
                <AttachMenu />
                <button
                  type="button"
                  className={styles['controlIconButton']}
                  aria-label={CODE_COPY.startDictation}
                  disabled={disabled}
                  onClick={dictation.start}
                >
                  <Mic size={CONTROL_GLYPH_SIZE} aria-hidden="true" />
                </button>
                <span className={styles['controlSpacer']} />
                <ComposerFooter inline showStyleSelector={false} />
                <UsageRing />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
