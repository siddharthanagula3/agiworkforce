import { desktopCapturer, powerMonitor, screen, type BrowserWindow, type Display } from 'electron';
import {
  SKILL_CAPTURE_CHANNELS,
  SKILL_CAPTURE_LIMITS,
  isSkillCaptureConsent,
  type SkillCaptureFrame,
  type SkillCapturePhase,
  type SkillCaptureRecording,
  type SkillCaptureStartOutcome,
  type SkillCaptureStatus,
  type SkillCaptureStopCause,
} from '@agiworkforce/local-runtime-contract';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { openRecorderOverlay, type RecorderOverlay } from '../recorderOverlayWindow';
import { FRAME_SAMPLE_WIDTH, frameDiffers, frameLuma } from './computerUseLoop';
import { secureInputActive } from './computerUseService';
import { showDevicePrompt } from './devicePrompts';
import { systemPermissionStatus } from './systemPermissions';

export class SkillCaptureRefused extends Error {
  readonly code: 'conflict' | 'invalid-arguments' | 'unsupported-platform' | 'permission-denied';

  constructor(code: SkillCaptureRefused['code'], message: string) {
    super(message);
    this.name = 'SkillCaptureRefused';
    this.code = code;
  }
}

const JPEG_QUALITY = 70;
const SUPPORTED_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set(['darwin', 'win32']);
const CONFIRM_BUTTONS = ['Cancel', 'Start recording'] as const;
const SCREEN_RECORDING_OFF = `Screen Recording is off for ${PRODUCT_NAMES.desktop}. Turn it on in System Settings > Privacy & Security > Screen & System Audio Recording, then try again.`;
const DISPLAY_LOST = 'The screen being recorded was disconnected or could not be found.';
const INDICATOR_FAILED = 'The recording indicator could not be shown, so nothing was recorded.';
const SECURE_INPUT_UNCHECKED = `${PRODUCT_NAMES.desktop} cannot check for password fields on this Mac, so it cannot record the screen.`;

interface Session {
  startedAt: number;
  displayId: number;
  ownerId: number;
  owner: BrowserWindow;
  frames: SkillCaptureFrame[];
  lastLuma: Uint8Array | null;
  timer: ReturnType<typeof setInterval> | null;
  overlay: RecorderOverlay | null;
  capturing: boolean;
  stoppedAt: number | null;
  stoppedBy: SkillCaptureStopCause | null;
  failure: string | null;
  secureInputSkips: number;
  retention: ReturnType<typeof setTimeout> | null;
}

let session: Session | null = null;
let starting = false;

function support(): { available: true } | { available: false; reason: string } {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    return {
      available: false,
      reason: `Recording a skill is supported on macOS and Windows; this device runs ${process.platform}.`,
    };
  }
  return { available: true };
}

function phase(): SkillCapturePhase {
  if (!session) return 'idle';
  return session.stoppedAt === null ? 'recording' : 'stopped';
}

export function skillCaptureStatus(): SkillCaptureStatus {
  const supported = support();
  const now = Date.now();
  return {
    available: supported.available,
    unavailableReason: supported.available ? null : supported.reason,
    phase: phase(),
    channels: SKILL_CAPTURE_CHANNELS,
    startedAt: session?.startedAt ?? null,
    durationMs: session ? (session.stoppedAt ?? now) - session.startedAt : 0,
    frameCount: session?.frames.length ?? 0,
    stoppedBy: session?.stoppedBy ?? null,
    failure: session?.failure ?? null,
    screenRecording: systemPermissionStatus('screen-recording'),
    displayId: session?.displayId ?? null,
    secureInputSkips: session?.secureInputSkips ?? 0,
    discardsAt:
      session && session.stoppedAt !== null
        ? session.stoppedAt + SKILL_CAPTURE_LIMITS.stoppedRetentionMs
        : null,
  };
}

function screenRecordingBlocked(): boolean {
  const status = systemPermissionStatus('screen-recording');
  return status === 'denied' || status === 'restricted';
}

type FrameRead = { image: Electron.NativeImage } | { lost: true } | { blank: true };

/**
 * Reads only the display the recording started on, the one its indicator is
 * shown on. A display that is gone, or that no capture source can be matched
 * to, is never swapped for another screen.
 */
async function captureFrame(displayId: number): Promise<FrameRead> {
  const display = screen.getAllDisplays().find((entry) => entry.id === displayId);
  if (!display) return { lost: true };
  const physicalWidth = Math.round(display.size.width * display.scaleFactor);
  const width = Math.min(SKILL_CAPTURE_LIMITS.frameMaxWidth, physicalWidth);
  const height = Math.round((width * display.size.height) / display.size.width);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  const source = sources.find((entry) => entry.display_id === String(displayId));
  if (source && !source.thumbnail.isEmpty()) return { image: source.thumbnail };
  if (!source && sources.some((entry) => !entry.thumbnail.isEmpty())) return { lost: true };
  return { blank: true };
}

/**
 * macOS secure input means a password field or similar has the keyboard. The
 * frame is dropped when it is on before or after the capture, and when the
 * check itself cannot answer. Windows has no equivalent signal.
 */
async function secureInputMayBeOn(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    return await secureInputActive();
  } catch {
    return true;
  }
}

async function captureUnlessSecure(displayId: number): Promise<FrameRead | { secure: true }> {
  if (await secureInputMayBeOn()) return { secure: true };
  const read = await captureFrame(displayId);
  if (!('image' in read)) return read;
  if (await secureInputMayBeOn()) return { secure: true };
  return read;
}

function keepFrame(current: Session, image: Electron.NativeImage, at: number): void {
  const luma = frameLuma(image.resize({ width: FRAME_SAMPLE_WIDTH, quality: 'good' }).toBitmap());
  if (!frameDiffers(current.lastLuma, luma)) return;
  current.lastLuma = luma;
  const size = image.getSize();
  current.frames.push({
    offsetMs: at - current.startedAt,
    mimeType: 'image/jpeg',
    imageBase64: image.toJPEG(JPEG_QUALITY).toString('base64'),
    width: size.width,
    height: size.height,
  });
}

function onScreenLocked(): void {
  stopSkillCapture('screen-locked');
}

function onDisplayRemoved(_event: unknown, display: Display): void {
  if (session && session.displayId === display.id) stopSkillCapture('display-lost', DISPLAY_LOST);
}

function watchSystem(on: boolean): void {
  const method = on ? 'on' : 'removeListener';
  powerMonitor[method]('lock-screen', onScreenLocked);
  powerMonitor[method]('suspend', onScreenLocked);
  screen[method]('display-removed', onDisplayRemoved);
}

async function sample(current: Session): Promise<void> {
  if (session !== current || current.stoppedAt !== null || current.capturing) return;
  const now = Date.now();
  if (
    now - current.startedAt >= SKILL_CAPTURE_LIMITS.maxDurationMs ||
    current.frames.length >= SKILL_CAPTURE_LIMITS.maxFrames
  ) {
    stopSkillCapture('limit');
    return;
  }
  current.capturing = true;
  try {
    const read = await captureUnlessSecure(current.displayId);
    if (session !== current || current.stoppedAt !== null) return;
    if ('secure' in read) {
      current.secureInputSkips += 1;
      return;
    }
    if ('lost' in read) {
      stopSkillCapture('display-lost', DISPLAY_LOST);
      return;
    }
    if ('blank' in read) {
      stopSkillCapture('failed', SCREEN_RECORDING_OFF);
      return;
    }
    keepFrame(current, read.image, now);
  } catch {
    stopSkillCapture('failed', 'The screen could not be captured.');
  } finally {
    current.capturing = false;
  }
}

const discardWhenOwnerCloses = (): void => {
  discardSkillCapture();
};

async function confirmStart(window: BrowserWindow): Promise<boolean> {
  const result = await showDevicePrompt(window, {
    type: 'question',
    buttons: [...CONFIRM_BUTTONS],
    defaultId: 0,
    cancelId: 0,
    title: 'Record a skill',
    message: 'Record your screen?',
    detail: `${PRODUCT_NAMES.desktop} takes a screenshot every few seconds until you stop. Clicks, typing and audio are not recorded. Screenshots stay on this device until you save or discard the recording.`,
    noLink: true,
  });
  return result.response === CONFIRM_BUTTONS.indexOf('Start recording');
}

function refusal(
  reason: Extract<SkillCaptureStartOutcome, { started: false }>['reason'],
  message: string,
): Extract<SkillCaptureStartOutcome, { started: false }> {
  return { started: false, reason, message, status: skillCaptureStatus() };
}

/**
 * A recording starts only from a window of this app, against the consent
 * revision the page showed, and after the user answers a native prompt the page
 * cannot answer for them.
 */
export async function startSkillCapture(
  window: BrowserWindow | null,
  consentRevision: unknown,
): Promise<SkillCaptureStartOutcome> {
  if (!isSkillCaptureConsent(consentRevision)) {
    throw new SkillCaptureRefused(
      'invalid-arguments',
      '"consentRevision" does not match the consent this app asks for.',
    );
  }
  if (!window || window.isDestroyed()) {
    throw new SkillCaptureRefused('invalid-arguments', 'Start a recording from an app window.');
  }
  const supported = support();
  if (!supported.available) throw new SkillCaptureRefused('unsupported-platform', supported.reason);
  if (starting || phase() === 'recording') {
    throw new SkillCaptureRefused('conflict', 'A recording is already in progress.');
  }
  if (phase() === 'stopped') {
    throw new SkillCaptureRefused('conflict', 'Save or discard the last recording first.');
  }

  starting = true;
  try {
    if (screenRecordingBlocked()) return refusal('permission', SCREEN_RECORDING_OFF);
    if (process.platform === 'darwin') {
      try {
        await secureInputActive();
      } catch {
        return refusal('unavailable', SECURE_INPUT_UNCHECKED);
      }
    }
    if (!(await confirmStart(window))) return refusal('declined', 'Recording was cancelled.');
    if (window.isDestroyed()) return refusal('declined', 'Recording was cancelled.');
    return await beginRecording(window);
  } finally {
    starting = false;
  }
}

/**
 * The display under the pointer when the user confirmed is the one recorded,
 * for the whole recording, and the indicator is shown there before the first
 * frame is taken.
 */
async function beginRecording(window: BrowserWindow): Promise<SkillCaptureStartOutcome> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const startedAt = Date.now();
  let started = false;
  let stoppedBeforeStart = false;
  const overlay = openRecorderOverlay({
    startedAt,
    display,
    onStop: () => {
      if (started) stopSkillCapture('user', null, { bringBack: true });
      else stoppedBeforeStart = true;
    },
  });
  const cancelled = (): boolean => stoppedBeforeStart || window.isDestroyed();
  try {
    if (!(await overlay.shown)) return refusal('unavailable', INDICATOR_FAILED);
    if (cancelled()) return refusal('declined', 'Recording was cancelled.');
    const first = await captureUnlessSecure(display.id);
    if (cancelled()) return refusal('declined', 'Recording was cancelled.');
    if ('lost' in first) return refusal('unavailable', DISPLAY_LOST);
    if ('blank' in first) return refusal('permission', SCREEN_RECORDING_OFF);

    const current: Session = {
      startedAt,
      displayId: display.id,
      ownerId: window.webContents.id,
      owner: window,
      frames: [],
      lastLuma: null,
      timer: null,
      overlay,
      capturing: false,
      stoppedAt: null,
      stoppedBy: null,
      failure: null,
      secureInputSkips: 0,
      retention: null,
    };
    session = current;
    started = true;
    if ('image' in first) keepFrame(current, first.image, Date.now());
    else current.secureInputSkips += 1;
    window.once('closed', discardWhenOwnerCloses);
    watchSystem(true);
    current.timer = setInterval(() => void sample(current), SKILL_CAPTURE_LIMITS.frameIntervalMs);
    return { started: true, status: skillCaptureStatus() };
  } finally {
    if (!started) overlay.close();
  }
}

export function stopSkillCapture(
  cause: SkillCaptureStopCause = 'user',
  failure: string | null = null,
  options: { bringBack?: boolean } = {},
): SkillCaptureStatus {
  const current = session;
  if (!current || current.stoppedAt !== null) return skillCaptureStatus();
  current.stoppedAt = Date.now();
  current.stoppedBy = cause;
  current.failure = failure;
  if (current.timer) clearInterval(current.timer);
  current.timer = null;
  watchSystem(false);
  const overlay = current.overlay;
  current.overlay = null;
  overlay?.close();
  if (options.bringBack && !current.owner.isDestroyed()) {
    if (current.owner.isMinimized()) current.owner.restore();
    current.owner.show();
    current.owner.focus();
  }
  current.retention = setTimeout(() => {
    if (session === current) discardSkillCapture();
  }, SKILL_CAPTURE_LIMITS.stoppedRetentionMs);
  return skillCaptureStatus();
}

function forget(current: Session): void {
  if (current.retention) clearTimeout(current.retention);
  current.retention = null;
  if (!current.owner.isDestroyed()) {
    current.owner.removeListener('closed', discardWhenOwnerCloses);
  }
  session = null;
}

export function discardSkillCapture(): SkillCaptureStatus {
  const current = session;
  if (!current) return skillCaptureStatus();
  stopSkillCapture('user');
  current.frames = [];
  forget(current);
  return skillCaptureStatus();
}

/**
 * Hands the frames to the window that started the recording, once, and keeps
 * nothing afterwards: what happens to them next is that page's to ask for.
 */
export function saveSkillCapture(window: BrowserWindow | null): SkillCaptureRecording {
  const current = session;
  if (!current) throw new SkillCaptureRefused('conflict', 'There is no recording to save.');
  if (!window || window.isDestroyed() || window.webContents.id !== current.ownerId) {
    throw new SkillCaptureRefused(
      'permission-denied',
      'Only the window that started this recording can save it.',
    );
  }
  stopSkillCapture('user');
  const recording: SkillCaptureRecording = {
    startedAt: current.startedAt,
    durationMs: (current.stoppedAt ?? Date.now()) - current.startedAt,
    channels: SKILL_CAPTURE_CHANNELS,
    frames: current.frames,
  };
  forget(current);
  return recording;
}
