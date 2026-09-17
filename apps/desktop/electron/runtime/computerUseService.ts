import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { app, desktopCapturer, screen, systemPreferences } from 'electron';
import type {
  DeviceKeyModifier,
  DeviceMouseButton,
  DeviceStepRegion,
} from '@agiworkforce/local-runtime-contract';
import type { DeviceScreenDisplay } from '@agiworkforce/local-runtime-contract';
import {
  chooseCaptureDisplay,
  describeDisplays,
  frameHelperLines,
  readHelperReply,
} from './computerUseProtocol';

/**
 * Desktop computer use: what is on the screen, and the mouse and keyboard.
 *
 * Electron can capture a display but cannot synthesise input, so the input half
 * runs in a small signed helper (`native/macos/agi-input.swift`) that owns the
 * CGEvent calls. One helper process serves a whole session, because a drag
 * depends on pointer state surviving between calls.
 *
 * Coordinates the model sends are in the frame of the last screenshot this
 * process returned, never in physical pixels and never in whatever display
 * happened to be under the cursor at the time. Everything a step is aimed at is
 * resolved from that remembered frame, so a click lands where the picture the
 * model was looking at said it would.
 */

export type ComputerUseUnsupported = { supported: false; reason: string };
export type ComputerUseSupported = { supported: true };
export type ComputerUseAvailability = ComputerUseSupported | ComputerUseUnsupported;

export interface ScreenCapture {
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  scaleFactor: number;
  displayName: string;
  displayId: number;
  displays: DeviceScreenDisplay[];
}

export class ComputerUseRefused extends Error {
  readonly reason: 'unsupported' | 'permission' | 'failed' | 'paused';

  constructor(reason: ComputerUseRefused['reason'], message: string) {
    super(message);
    this.name = 'ComputerUseRefused';
    this.reason = reason;
  }
}

const MAX_FRAME_WIDTH = 1_280;
const MAX_PNG_BASE64_LENGTH = 900_000;
const JPEG_QUALITY = 82;
const HELPER_REPLY_TIMEOUT_MS = 15_000;

interface CaptureFrame {
  displayId: number;
  bounds: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
}

let lastFrame: CaptureFrame | null = null;

function helperSourcePath(): string {
  return path.join(__dirname, '..', 'native', 'macos', 'agi-input.swift');
}

function compiledHelperPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'agi-input')
    : path.join(__dirname, 'agi-input');
}

function isFresh(binary: string, source: string): boolean {
  if (!existsSync(binary)) return false;
  if (!existsSync(source)) return true;
  return statSync(binary).mtimeMs >= statSync(source).mtimeMs;
}

/**
 * The packaged app ships the compiled helper beside the bundle, so it is signed
 * and notarized with it. A development run has no such resource and builds it
 * once from the checked-in source; a machine without the Swift toolchain
 * reports the capability unavailable rather than failing on the first click.
 */
function resolveHelper(): { path: string } | ComputerUseUnsupported {
  const binary = compiledHelperPath();
  const source = helperSourcePath();
  if (isFresh(binary, source)) return { path: binary };
  if (app.isPackaged) {
    return { supported: false, reason: 'This build does not include the input helper.' };
  }
  if (!existsSync(source)) {
    return { supported: false, reason: 'The input helper source is missing from this checkout.' };
  }
  mkdirSync(path.dirname(binary), { recursive: true });
  const built = spawnSync('swiftc', ['-O', source, '-o', binary], { encoding: 'utf8' });
  if (built.error || built.status !== 0) {
    return {
      supported: false,
      reason:
        built.error?.message.includes('ENOENT') === true
          ? 'Controlling the mouse and keyboard needs the Swift toolchain; install Xcode command line tools.'
          : 'The input helper could not be built on this machine.',
    };
  }
  return { path: binary };
}

let helper: ChildProcessWithoutNullStreams | null = null;
let pending: Array<{ resolve: (value: void) => void; reject: (error: Error) => void }> = [];
let buffer = '';

function settleAllPending(error: Error): void {
  const waiting = pending;
  pending = [];
  for (const entry of waiting) entry.reject(error);
}

function readHelperLine(line: string): void {
  const entry = pending.shift();
  if (!entry) return;
  const reply = readHelperReply(line);
  if (reply.ok) entry.resolve();
  else entry.reject(new ComputerUseRefused('failed', reply.error));
}

function startHelper(): ChildProcessWithoutNullStreams | ComputerUseUnsupported {
  if (helper && !helper.killed && helper.exitCode === null) return helper;
  const resolved = resolveHelper();
  if ('supported' in resolved) return resolved;

  const child = spawn(resolved.path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    const framed = frameHelperLines(buffer + chunk);
    buffer = framed.rest;
    for (const line of framed.lines) readHelperLine(line);
  });
  child.on('exit', () => {
    helper = null;
    buffer = '';
    settleAllPending(new ComputerUseRefused('failed', 'The input helper stopped unexpectedly.'));
  });
  child.on('error', (error) => {
    helper = null;
    settleAllPending(new ComputerUseRefused('failed', error.message));
  });
  helper = child;
  return child;
}

let takenOver = false;

export function isComputerUseTakenOver(): boolean {
  return takenOver;
}

export function takeOverComputerUse(): { takenOver: true } {
  takenOver = true;
  stopComputerUseHelper();
  return { takenOver: true };
}

export function handBackComputerUse(): { takenOver: false } {
  takenOver = false;
  lastFrame = null;
  return { takenOver: false };
}

export function stopComputerUseHelper(): void {
  helper?.kill();
  helper = null;
  settleAllPending(new ComputerUseRefused('failed', 'The input helper was stopped.'));
}

function sendToHelper(request: Record<string, unknown>): Promise<void> {
  const started = startHelper();
  if ('supported' in started) {
    return Promise.reject(new ComputerUseRefused('unsupported', started.reason));
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ComputerUseRefused('failed', 'The input helper did not answer.'));
    }, HELPER_REPLY_TIMEOUT_MS);
    pending.push({
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    started.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

export function screenCaptureAllowed(): boolean {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('screen');
  return status !== 'denied' && status !== 'restricted';
}

/**
 * Whether this machine can be driven at all, and why not when it cannot.
 *
 * `prompt` decides whether macOS is asked for Accessibility here: the check
 * with a prompt opens System Settings for the user, which belongs to the moment
 * they granted the capability, not to the capability declaration the shell
 * sends on every chat request.
 */
export function computerUseAvailability(prompt = false): ComputerUseAvailability {
  if (process.platform !== 'darwin') {
    return {
      supported: false,
      reason: `Controlling the mouse and keyboard is supported on macOS only; this device runs ${process.platform}.`,
    };
  }
  const resolved = resolveHelper();
  if ('supported' in resolved) return resolved;
  if (!screenCaptureAllowed()) {
    return {
      supported: false,
      reason:
        'Screen Recording is off for this app. Turn it on in System Settings > Privacy & Security > Screen & System Audio Recording, then relaunch.',
    };
  }
  if (!systemPreferences.isTrustedAccessibilityClient(prompt)) {
    return {
      supported: false,
      reason:
        'Accessibility is off for this app, so it cannot move the pointer or type. Turn it on in System Settings > Privacy & Security > Accessibility.',
    };
  }
  return { supported: true };
}

/**
 * The Accessibility check is asked with a prompt here and nowhere else: this
 * runs only after the user granted computer.use, so the System Settings pane it
 * opens is the answer to something they just asked for.
 */
function requireAvailable(): void {
  if (takenOver) {
    throw new ComputerUseRefused(
      'paused',
      'The user has taken over the screen. Do not try another screen step; tell them what you were about to do and wait for them to hand control back.',
    );
  }
  const availability = computerUseAvailability(true);
  if (!availability.supported) {
    throw new ComputerUseRefused(
      availability.reason.includes('Privacy & Security') ? 'permission' : 'unsupported',
      availability.reason,
    );
  }
}

function targetDisplay(requestedId?: number): Electron.Display {
  const chosen = chooseCaptureDisplay(screen.getAllDisplays(), {
    ...(requestedId === undefined ? {} : { requestedId }),
    rememberedId: lastFrame?.displayId ?? null,
    fallback: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
  });
  if ('unknownDisplay' in chosen) {
    throw new ComputerUseRefused(
      'failed',
      `Display ${chosen.unknownDisplay} is not connected. Take a screenshot without a display to see the connected ones.`,
    );
  }
  return chosen;
}

function connectedDisplays(): DeviceScreenDisplay[] {
  return describeDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id);
}

function encode(image: Electron.NativeImage): {
  imageBase64: string;
  mimeType: ScreenCapture['mimeType'];
} {
  const png = image.toPNG().toString('base64');
  if (png.length <= MAX_PNG_BASE64_LENGTH) return { imageBase64: png, mimeType: 'image/png' };
  return { imageBase64: image.toJPEG(JPEG_QUALITY).toString('base64'), mimeType: 'image/jpeg' };
}

async function captureDisplay(display: Electron.Display): Promise<Electron.NativeImage> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    },
  });
  const source =
    sources.find((entry) => entry.display_id === String(display.id)) ??
    sources.find((entry) => !entry.thumbnail.isEmpty());
  if (!source || source.thumbnail.isEmpty()) {
    throw new ComputerUseRefused(
      'permission',
      'No screen content came back. Check Screen Recording for this app in System Settings, then relaunch.',
    );
  }
  return source.thumbnail;
}

export async function captureScreen(displayId?: number): Promise<ScreenCapture> {
  requireAvailable();
  const display = targetDisplay(displayId);
  const full = await captureDisplay(display);
  const frameWidth = Math.min(display.size.width, MAX_FRAME_WIDTH);
  const resized =
    frameWidth === full.getSize().width
      ? full
      : full.resize({ width: frameWidth, quality: 'good' });
  const size = resized.getSize();
  lastFrame = {
    displayId: display.id,
    bounds: display.bounds,
    frameWidth: size.width,
    frameHeight: size.height,
  };
  return {
    ...encode(resized),
    width: size.width,
    height: size.height,
    scaleFactor: display.scaleFactor,
    displayName: display.label || 'the main screen',
    displayId: display.id,
    displays: connectedDisplays(),
  };
}

export async function captureRegion(region: DeviceStepRegion): Promise<ScreenCapture> {
  requireAvailable();
  const display = targetDisplay();
  const full = await captureDisplay(display);
  const frame = lastFrame ?? {
    displayId: display.id,
    bounds: display.bounds,
    frameWidth: Math.min(display.size.width, MAX_FRAME_WIDTH),
    frameHeight: Math.round(
      (Math.min(display.size.width, MAX_FRAME_WIDTH) / display.size.width) * display.size.height,
    ),
  };
  const captured = full.getSize();
  const scale = captured.width / frame.frameWidth;
  const cropped = full.crop({
    x: Math.max(0, Math.min(captured.width - 1, Math.round(region.x * scale))),
    y: Math.max(0, Math.min(captured.height - 1, Math.round(region.y * scale))),
    width: Math.max(1, Math.min(captured.width, Math.round(region.width * scale))),
    height: Math.max(1, Math.min(captured.height, Math.round(region.height * scale))),
  });
  const bounded =
    cropped.getSize().width > MAX_FRAME_WIDTH
      ? cropped.resize({ width: MAX_FRAME_WIDTH, quality: 'good' })
      : cropped;
  const size = bounded.getSize();
  return {
    ...encode(bounded),
    width: size.width,
    height: size.height,
    scaleFactor: display.scaleFactor,
    displayName: display.label || 'the main screen',
    displayId: display.id,
    displays: connectedDisplays(),
  };
}

/**
 * Turns a point in the last screenshot's frame into a point on the display.
 *
 * Without a screenshot there is no frame to read the point against, so the step
 * is refused: guessing a display would put a click somewhere the model never
 * looked.
 */
function toDisplayPoint(x: number, y: number): { x: number; y: number } {
  if (!lastFrame) {
    throw new ComputerUseRefused(
      'failed',
      'Take a screenshot first: there is no picture to read those coordinates against.',
    );
  }
  const scaleX = lastFrame.bounds.width / lastFrame.frameWidth;
  const scaleY = lastFrame.bounds.height / lastFrame.frameHeight;
  return {
    x: Math.round(lastFrame.bounds.x + x * scaleX),
    y: Math.round(lastFrame.bounds.y + y * scaleY),
  };
}

export async function movePointer(x: number, y: number): Promise<true> {
  requireAvailable();
  await sendToHelper({ action: 'move', ...toDisplayPoint(x, y) });
  return true;
}

export async function clickPointer(
  x: number,
  y: number,
  button: DeviceMouseButton,
  count: number,
): Promise<true> {
  requireAvailable();
  await sendToHelper({ action: 'click', ...toDisplayPoint(x, y), button, count });
  return true;
}

export async function dragPointer(x: number, y: number, toX: number, toY: number): Promise<true> {
  requireAvailable();
  const from = toDisplayPoint(x, y);
  const to = toDisplayPoint(toX, toY);
  await sendToHelper({ action: 'drag', x: from.x, y: from.y, toX: to.x, toY: to.y });
  return true;
}

export async function scrollPointer(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
): Promise<true> {
  requireAvailable();
  await sendToHelper({ action: 'scroll', ...toDisplayPoint(x, y), deltaX, deltaY });
  return true;
}

export async function typeText(text: string): Promise<true> {
  requireAvailable();
  await sendToHelper({ action: 'type', text });
  return true;
}

export async function pressKey(key: string, modifiers: DeviceKeyModifier[]): Promise<true> {
  requireAvailable();
  await sendToHelper({ action: 'key', key, modifiers });
  return true;
}

export function waitFor(ms: number): Promise<true> {
  return new Promise((resolve) => setTimeout(() => resolve(true), ms));
}
