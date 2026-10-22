import { useRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { baseInitOptions } from '@agiworkforce/i18n';
import type {
  SkillCaptureRecording,
  SkillCaptureStatus,
} from '@agiworkforce/local-runtime-contract';
import { ComposerPlusMenu, type ComposerPlusMenuProps } from './ComposerPlusMenu';
import { SKILL_CAPTURE_CONSENT_TEXT } from '@/features/skill-recorder';
import { resetRecorderForTests } from '@/features/skill-recorder/lib/recorder-store';

type SaveAsSkillModule = typeof import('@/features/skills/components/save-as-skill');

const authoring = vi.hoisted(() => ({ allowed: true }));
vi.mock('@/features/skills/components/save-as-skill', async (importOriginal) => ({
  ...(await importOriginal<SaveAsSkillModule>()),
  useSkillAuthoringCapability: (enabled: boolean) => enabled && authoring.allowed,
}));

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toasts }));

const IDLE: SkillCaptureStatus = {
  available: true,
  unavailableReason: null,
  phase: 'idle',
  channels: ['screen'],
  startedAt: null,
  durationMs: 0,
  frameCount: 0,
  stoppedBy: null,
  failure: null,
  screenRecording: 'granted',
  displayId: null,
  secureInputSkips: 0,
  discardsAt: null,
};

const RECORDING: SkillCaptureStatus = {
  ...IDLE,
  phase: 'recording',
  startedAt: Date.now(),
  frameCount: 2,
  displayId: 1,
};

const DISCARDS_AT = new Date(2026, 9, 22, 15, 45).getTime();

const STOPPED: SkillCaptureStatus = {
  ...RECORDING,
  phase: 'stopped',
  durationMs: 9_000,
  frameCount: 3,
  stoppedBy: 'user',
  secureInputSkips: 1,
  discardsAt: DISCARDS_AT,
};

const SAVED: SkillCaptureRecording = {
  startedAt: 1_000,
  durationMs: 9_000,
  channels: ['screen'],
  frames: [0, 3_000, 6_000].map((offsetMs) => ({
    offsetMs,
    mimeType: 'image/jpeg' as const,
    imageBase64: btoa('jpeg'),
    width: 1280,
    height: 800,
  })),
};

type Reply = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } };

function installHost(
  replies: Partial<Record<string, (args?: Record<string, unknown>) => Reply>>,
  platform = 'electron-darwin',
) {
  const invokeRuntime = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    const reply = replies[command];
    return reply
      ? reply(args)
      : { ok: false, error: { code: 'unknown-command', message: command } };
  });
  Object.assign(window, {
    agiHost: {
      shell: 'electron',
      platform,
      appVersion: '1.2.0',
      onRuntimeEvent: vi.fn(() => () => undefined),
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onHostCommand: vi.fn(() => () => undefined),
      invokeRuntime,
    },
  });
  return invokeRuntime;
}

const ok = (value: unknown) => (): Reply => ({ ok: true, value });

function baseProps(): Omit<ComposerPlusMenuProps, 'anchorRef' | 'contentRef'> {
  return {
    open: true,
    onRequestClose: vi.fn(),
    closeMenu: vi.fn(),
    workPalette: false,
    onAddFiles: vi.fn(),
    onAttachLibraryFile: vi.fn(),
    mediaModeActive: false,
    attachmentsUnavailable: false,
    mediaModeNoun: 'Image',
    billingPolicyReady: true,
    billingPolicyError: false,
    mediaAvailabilityStatus: 'ready',
    hostCanGenerateImage: false,
    imageModelsAvailable: false,
    canUseImageGeneration: false,
    imageMode: false,
    onCreateImage: vi.fn(),
    hostCanGenerateVideo: false,
    videoModelsAvailable: false,
    canUseVideoGeneration: false,
    videoMode: false,
    onCreateVideo: vi.fn(),
    showLocalFolderRow: false,
    showDesktopActionRows: false,
    isReadingClipboard: false,
    onAttachClipboard: vi.fn(),
    onRunLocalCommand: vi.fn(),
    onUseBrowser: vi.fn(),
    deviceStepsEnabled: false,
    onToggleDeviceSteps: vi.fn(),
    onAttachFromLocalFolder: vi.fn(),
    showWorkingFolderRow: false,
    canPickFolder: false,
    folderName: null,
    onPickFolder: vi.fn(),
    onClearFolder: vi.fn(),
    selectedSkillName: null,
    onOpenSettings: vi.fn(),
    connectorsSubmenuOpen: false,
    onToggleConnectorsSubmenu: vi.fn(),
    connectorsLoading: false,
    connectors: [],
    disabledConnectorIds: [],
    onSetConnectorEnabled: vi.fn(),
    webSearchEnabled: false,
    showScopeRow: false,
    scopeOpen: false,
    scopeDisabled: false,
    onToggleScope: vi.fn(),
    researchEnabled: false,
    researchDisabled: false,
    onToggleResearch: vi.fn(),
    codeExecutionEnabled: false,
    codeExecutionDisabled: false,
    onToggleCodeExecution: vi.fn(),
    officeOutputFormat: null,
    officeCreationDisabled: false,
    onSelectOfficeOutput: vi.fn(),
    memoryEnabled: false,
    memoryDisabled: false,
    onToggleMemory: vi.fn(),
    showTemporaryChat: false,
    temporaryChatSaving: false,
    isIncognito: false,
    canToggleIncognito: false,
    onToggleIncognito: vi.fn(),
    canEndTemporaryChat: false,
    onEndTemporaryChat: vi.fn(),
    skills: [{ name: 'skill-creator', description: 'Draft a skill bundle', source: 'bundled' }],
    onSelectSkill: vi.fn(),
    folders: [],
    onSelectFolder: vi.fn(),
  };
}

function Harness(props: Omit<ComposerPlusMenuProps, 'anchorRef' | 'contentRef'>) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <button type="button" ref={anchorRef}>
        Open composer menu
      </button>
      <ComposerPlusMenu {...props} anchorRef={anchorRef} contentRef={contentRef} />
    </>
  );
}

function renderMenu(overrides: Partial<ComposerPlusMenuProps> = {}) {
  const props = { ...baseProps(), ...overrides };
  const instance = createInstance();
  void instance.use(initReactI18next).init({ ...baseInitOptions, lng: 'en' });
  const utils = render(
    <I18nextProvider i18n={instance}>
      <Harness {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

beforeEach(() => {
  authoring.allowed = true;
  toasts.success.mockReset();
});

afterEach(() => {
  resetRecorderForTests();
  Reflect.deleteProperty(window, 'agiHost');
  vi.restoreAllMocks();
});

describe('Record a skill in the composer menu', () => {
  it('is absent in a browser', () => {
    renderMenu();

    expect(screen.queryByRole('button', { name: 'Record a skill' })).not.toBeInTheDocument();
  });

  it('is absent when the host cannot record or predates skill capture', async () => {
    const invoke = installHost({
      skill_capture_status: ok({ ...IDLE, available: false, unavailableReason: 'linux' }),
    });
    const { unmount } = renderMenu();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('skill_capture_status', undefined));
    expect(screen.queryByRole('button', { name: 'Record a skill' })).not.toBeInTheDocument();
    unmount();
    resetRecorderForTests();

    const older = installHost({});
    renderMenu();
    await waitFor(() => expect(older).toHaveBeenCalledWith('skill_capture_status', undefined));
    expect(screen.queryByRole('button', { name: 'Record a skill' })).not.toBeInTheDocument();
  });

  it('is absent when the account cannot author skills', async () => {
    authoring.allowed = false;
    const invoke = installHost({ skill_capture_status: ok(IDLE) });
    renderMenu();

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Record a skill' })).not.toBeInTheDocument();
  });

  it('sits under the attach row in the chat menu and the work palette', async () => {
    installHost({ skill_capture_status: ok(IDLE) });
    const { rerender } = renderMenu();

    const row = await screen.findByRole('button', { name: 'Record a skill' });
    const attach = screen.getByRole('button', { name: /Add photos & files/ });
    expect(attach.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const props = { ...baseProps(), workPalette: true };
    const instance = createInstance();
    void instance.use(initReactI18next).init({ ...baseInitOptions, lng: 'en' });
    rerender(
      <I18nextProvider i18n={instance}>
        <Harness {...props} />
      </I18nextProvider>,
    );
    const menu = screen.getByRole('menu', { name: 'AGI Work tools' });
    expect(within(menu).getByRole('menuitem', { name: 'Record a skill' })).toBeInTheDocument();
  });

  it('asks for consent first, and Cancel or Escape start nothing', async () => {
    const invoke = installHost({ skill_capture_status: ok(IDLE) });
    const { props } = renderMenu();

    fireEvent.click(await screen.findByRole('button', { name: 'Record a skill' }));
    expect(props.closeMenu).toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Record a skill' });
    expect(within(dialog).getByText(SKILL_CAPTURE_CONSENT_TEXT)).toBeInTheDocument();
    expect(within(dialog).getByText(/Clicks, typing and audio are not recorded/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Record a skill' })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Record a skill' }));
    await screen.findByRole('dialog', { name: 'Record a skill' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Record a skill' })).not.toBeInTheDocument(),
    );

    expect(invoke).not.toHaveBeenCalledWith('skill_capture_start', expect.anything());
  });

  it('starts with Enter against the consent revision and shows the capture bar', async () => {
    const invoke = installHost({
      skill_capture_status: ok(IDLE),
      skill_capture_start: ok({ started: true, status: RECORDING }),
    });
    renderMenu();

    fireEvent.click(await screen.findByRole('button', { name: 'Record a skill' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record a skill' });
    expect(within(dialog).getByRole('button', { name: 'Start recording' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('skill_capture_start', { consentRevision: 1 }),
    );
    const bar = await screen.findByRole('complementary', { name: 'Skill recording' });
    expect(within(bar).getByRole('status')).toHaveTextContent('Recording · 2 screenshots');
    expect(within(bar).getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Record a skill' })).not.toBeInTheDocument();
  });

  it('shows the host refusal and offers System Settings when Screen Recording is off', async () => {
    const invoke = installHost({
      skill_capture_status: ok(IDLE),
      skill_capture_start: ok({
        started: false,
        reason: 'permission',
        message: 'Screen Recording is off for AGI Desktop.',
        status: IDLE,
      }),
      system_permission_open: ok(true),
    });
    renderMenu();

    fireEvent.click(await screen.findByRole('button', { name: 'Record a skill' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record a skill' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start recording' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Screen Recording is off for AGI Desktop.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open System Settings' }));
    expect(invoke).toHaveBeenCalledWith('system_permission_open', {
      permission: 'screen-recording',
    });
  });

  it('closes quietly when the native prompt is declined', async () => {
    installHost({
      skill_capture_status: ok(IDLE),
      skill_capture_start: ok({
        started: false,
        reason: 'declined',
        message: 'Recording was cancelled.',
        status: IDLE,
      }),
    });
    renderMenu();

    fireEvent.click(await screen.findByRole('button', { name: 'Record a skill' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record a skill' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start recording' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Record a skill' })).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('complementary', { name: 'Skill recording' }),
    ).not.toBeInTheDocument();
  });

  it('stops on Done, says when an unsaved recording is deleted, and fetches no frames yet', async () => {
    let status = RECORDING;
    const invoke = installHost({
      skill_capture_status: () => ({ ok: true, value: status }),
      skill_capture_stop: () => {
        status = STOPPED;
        return { ok: true, value: STOPPED };
      },
    });
    renderMenu();

    const bar = await screen.findByRole('complementary', { name: 'Skill recording' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Done' }));

    const summary = await screen.findByRole('dialog', { name: 'Your recording' });
    expect(within(summary).getByText('3 screenshots over 0:09.')).toBeInTheDocument();
    expect(
      within(summary).getByText('1 screenshot skipped while a password field was active.'),
    ).toBeInTheDocument();
    const time = new Date(DISCARDS_AT).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(
      within(summary).getByText(`If you do not save it, it is deleted at ${time}.`),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('skill_capture_save', undefined);

    await userEvent.keyboard('{Escape}');
    const stoppedBar = await screen.findByRole('complementary', { name: 'Skill recording' });
    expect(within(stoppedBar).getByRole('status')).toHaveTextContent('Recording stopped');
    expect(
      within(stoppedBar).getByText(`If you do not save it, it is deleted at ${time}.`),
    ).toBeInTheDocument();
  });

  it('hands the chosen screenshots to the composer with the skill creator only on Draft a skill', async () => {
    let status = STOPPED;
    const invoke = installHost({
      skill_capture_status: () => ({ ok: true, value: status }),
      skill_capture_save: () => {
        status = IDLE;
        return { ok: true, value: SAVED };
      },
    });
    const { props } = renderMenu();

    const bar = await screen.findByRole('complementary', { name: 'Skill recording' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Review' }));
    const summary = await screen.findByRole('dialog', { name: 'Your recording' });
    await userEvent.click(within(summary).getByRole('button', { name: 'Choose screenshots' }));

    const review = await screen.findByRole('dialog', { name: 'Choose screenshots' });
    expect(invoke).toHaveBeenCalledWith('skill_capture_save', undefined);
    expect(props.onAttachLibraryFile).not.toHaveBeenCalled();
    const shots = within(review).getAllByRole('button', { name: /^Screenshot \d at/ });
    expect(shots).toHaveLength(3);
    await userEvent.click(shots[1]!);
    expect(shots[1]).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(within(review).getByRole('button', { name: 'Draft a skill' }));

    const attach = vi.mocked(props.onAttachLibraryFile);
    expect(attach).toHaveBeenCalledTimes(2);
    expect(attach.mock.calls.map(([file]) => file.type)).toEqual(['image/jpeg', 'image/jpeg']);
    expect(props.onSelectSkill).toHaveBeenCalledWith('skill-creator');
    expect(toasts.success).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Choose screenshots' })).not.toBeInTheDocument(),
    );
  });

  it('keeps Draft a skill off while the composer cannot take attachments', async () => {
    installHost({
      skill_capture_status: ok(STOPPED),
      skill_capture_save: ok(SAVED),
    });
    renderMenu({ attachmentsUnavailable: true, attachmentUnavailableTitle: 'Leave video mode.' });

    const bar = await screen.findByRole('complementary', { name: 'Skill recording' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Review' }));
    const summary = await screen.findByRole('dialog', { name: 'Your recording' });
    await userEvent.click(within(summary).getByRole('button', { name: 'Choose screenshots' }));

    const review = await screen.findByRole('dialog', { name: 'Choose screenshots' });
    expect(within(review).getByText('Leave video mode.')).toBeInTheDocument();
    expect(within(review).getByRole('button', { name: 'Draft a skill' })).toBeDisabled();
  });

  it('discards only after a confirmation that names what is lost', async () => {
    const invoke = installHost({
      skill_capture_status: ok(RECORDING),
      skill_capture_discard: ok(IDLE),
    });
    renderMenu();

    const bar = await screen.findByRole('complementary', { name: 'Skill recording' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Discard' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      'The 2 screenshots in this recording will be deleted from this device. This cannot be undone.',
    );
    expect(invoke).not.toHaveBeenCalledWith('skill_capture_discard', undefined);

    await userEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('skill_capture_discard', undefined));
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Skill recording' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('marks the row while a recording runs', async () => {
    installHost({ skill_capture_status: ok(RECORDING) });
    renderMenu();

    await screen.findByRole('complementary', { name: 'Skill recording' });
    const row = screen.getByRole('button', { name: /Record a skill/ });
    expect(row).toBeDisabled();
    expect(row).toHaveTextContent('Recording');
  });
});

describe('the attach row shortcut', () => {
  it('shows the add-files chord and names it for assistive technology', () => {
    renderMenu();

    const attach = screen.getByRole('button', { name: /Add photos & files/ });
    expect(attach).toHaveAttribute('aria-keyshortcuts');
    expect(screen.getByTestId('composer-attach-shortcut')).toHaveTextContent(/U$/);
  });

  it('hides the chord when attachments are unavailable', () => {
    renderMenu({ attachmentsUnavailable: true });

    expect(screen.queryByTestId('composer-attach-shortcut')).not.toBeInTheDocument();
  });
});
