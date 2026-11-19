import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { app, clipboard, shell } from 'electron';
import {
  SIMULATOR_CAPTURE_LIMIT,
  SIMULATOR_CLIPBOARD_TEXT_LIMIT,
  SIMULATOR_RECORDING_LIMIT_MS,
  SIMULATOR_UNAVAILABLE_MESSAGES,
  isSimulatorCaptureId,
  isSimulatorUdid,
  readSimulatorDevices,
  type SimulatorAppearance,
  type SimulatorCapture,
  type SimulatorCaptureImage,
  type SimulatorCaptureKind,
  type SimulatorClipboardResult,
  type SimulatorDevice,
  type SimulatorFrame,
  type SimulatorSettings,
  type SimulatorStatus,
  type SimulatorStatusBar,
  type SimulatorUnavailableReason,
} from '@agiworkforce/local-runtime-contract';

const XCRUN = '/usr/bin/xcrun';
const SETTINGS_APP = 'com.apple.Preferences';
const CAPTURES_FOLDER = 'simulator-captures';
const FRAME_FILE_PREFIX = '.frame-';
const SCREENSHOT_EXTENSION = '.png';
const RECORDING_EXTENSION = '.mov';
const RECORDING_STARTED = 'Recording started';
const COMMAND_TIMEOUT_MS = 20_000;
const BOOT_TIMEOUT_MS = 180_000;
const RECORDING_START_TIMEOUT_MS = 15_000;
const RECORDING_STOP_TIMEOUT_MS = 15_000;
const OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;
const ALREADY_IN_STATE = /current state: (?:Booted|Shutdown)/i;
const CLEAN_STATUS_BAR = [
  '--time',
  '9:41',
  '--dataNetwork',
  'wifi',
  '--wifiMode',
  'active',
  '--wifiBars',
  '3',
  '--cellularMode',
  'active',
  '--cellularBars',
  '4',
  '--batteryState',
  'charged',
  '--batteryLevel',
  '100',
];

const NOT_RUNNING = 'That simulator is not running. Start it first.';
const UNKNOWN_DEVICE = 'That simulator is not on this Mac any more. Choose another.';
const ALREADY_RECORDING = 'A recording is already running. Stop it before starting another.';
const RECORDING_DID_NOT_START = 'The recording did not start. Check that the simulator is running.';
const CAPTURES_FULL = `You have ${SIMULATOR_CAPTURE_LIMIT} screenshots and recordings saved. Delete some to make room.`;
const UNKNOWN_CAPTURE = 'That capture is no longer saved.';
const NOT_A_SCREENSHOT = 'Only a screenshot can be added to the chat.';

export type SimulatorRefusal =
  'unsupported' | 'unavailable' | 'invalid' | 'not-found' | 'busy' | 'failed';

export class SimulatorRefused extends Error {
  constructor(
    readonly reason: SimulatorRefusal,
    message: string,
  ) {
    super(message);
  }
}

export interface SimctlOutput {
  stdout: string;
  stderr: string;
}

export interface SimctlRecording {
  /** Resolves once the first frame is on disk, rejects when the tool gives up first. */
  started: Promise<void>;
  /** Resolves when the tool has finished writing the file. */
  finished: Promise<void>;
  stop(): void;
  kill(): void;
}

export interface SimulatorTools {
  platform: NodeJS.Platform;
  run(args: string[], options?: { input?: string; timeoutMs?: number }): Promise<SimctlOutput>;
  record(args: string[]): SimctlRecording;
  capturesDir(): string;
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
  reveal(file: string): void;
  now(): number;
}

class SimctlFailed extends Error {
  constructor(
    readonly stderr: string,
    readonly missing: boolean,
  ) {
    super(stderr.trim() || 'simctl failed');
  }
}

function runSimctl(
  args: string[],
  options: { input?: string; timeoutMs?: number } = {},
): Promise<SimctlOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(XCRUN, ['simctl', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size <= OUTPUT_LIMIT_BYTES) into.push(chunk);
    };
    child.stdout.on('data', collect(out));
    child.stderr.on('data', collect(err));
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? COMMAND_TIMEOUT_MS);
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new SimctlFailed(error.message, error.code === 'ENOENT'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0) resolve({ stdout, stderr });
      else reject(new SimctlFailed(stderr, false));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input ?? '');
  });
}

function recordSimctl(args: string[]): SimctlRecording {
  const child = spawn(XCRUN, ['simctl', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  let seen = '';
  let exited = false;
  const finished = new Promise<void>((resolve) => {
    child.on('close', () => {
      exited = true;
      resolve();
    });
    child.on('error', () => {
      exited = true;
      resolve();
    });
  });
  const started = new Promise<void>((resolve, reject) => {
    child.stderr.on('data', (chunk: Buffer) => {
      if (seen.length < OUTPUT_LIMIT_BYTES) seen += chunk.toString('utf8');
      if (seen.includes(RECORDING_STARTED)) resolve();
    });
    void finished.then(() => reject(new SimctlFailed(seen, false)));
  });
  started.catch(() => undefined);
  return {
    started,
    finished,
    stop: () => {
      if (!exited) child.kill('SIGINT');
    },
    kill: () => {
      if (!exited) child.kill('SIGKILL');
    },
  };
}

const systemTools: SimulatorTools = {
  platform: process.platform,
  run: runSimctl,
  record: recordSimctl,
  capturesDir: () => path.join(app.getPath('userData'), CAPTURES_FOLDER),
  readClipboard: () => clipboard.readText(),
  writeClipboard: (text) => clipboard.writeText(text),
  reveal: (file) => shell.showItemInFolder(file),
  now: () => Date.now(),
};

interface ActiveRecording {
  id: string;
  udid: string;
  startedAtMs: number;
  process: SimctlRecording;
  limit: ReturnType<typeof setTimeout>;
}

let tools: SimulatorTools = systemTools;
let onChange: (status: SimulatorStatus) => void = () => undefined;
let recording: ActiveRecording | null = null;
const framesInFlight = new Map<string, Promise<SimulatorFrame>>();

export function configureSimulator(hooks: {
  onChange: (status: SimulatorStatus) => void;
  tools?: SimulatorTools;
}): void {
  onChange = hooks.onChange;
  tools = hooks.tools ?? systemTools;
}

export function simulatorSupported(): boolean {
  return tools.platform === 'darwin';
}

function unavailableReason(error: unknown): SimulatorUnavailableReason {
  if (!(error instanceof SimctlFailed)) return 'failed';
  const said = error.stderr.toLowerCase();
  if (said.includes('license')) return 'xcode-license';
  if (
    error.missing ||
    said.includes('unable to find utility') ||
    said.includes('xcode-select') ||
    said.includes('no developer tools') ||
    said.includes('requires xcode')
  ) {
    return 'xcode-missing';
  }
  return 'failed';
}

function refusal(error: unknown): SimulatorRefused {
  if (error instanceof SimulatorRefused) return error;
  const reason = unavailableReason(error);
  if (reason !== 'failed') {
    return new SimulatorRefused('unavailable', SIMULATOR_UNAVAILABLE_MESSAGES[reason]);
  }
  const said = error instanceof SimctlFailed ? error.stderr.toLowerCase() : '';
  if (said.includes('invalid device') || said.includes('no devices are booted')) {
    return new SimulatorRefused('not-found', UNKNOWN_DEVICE);
  }
  if (said.includes('current state: shutdown') || said.includes('not booted')) {
    return new SimulatorRefused('not-found', NOT_RUNNING);
  }
  return new SimulatorRefused('failed', SIMULATOR_UNAVAILABLE_MESSAGES.failed);
}

async function simctl(
  args: string[],
  options?: { input?: string; timeoutMs?: number },
): Promise<SimctlOutput> {
  if (!simulatorSupported()) {
    throw new SimulatorRefused(
      'unsupported',
      SIMULATOR_UNAVAILABLE_MESSAGES['unsupported-platform'],
    );
  }
  try {
    return await tools.run(args, options);
  } catch (error) {
    throw refusal(error);
  }
}

function requireUdid(udid: unknown): string {
  if (!isSimulatorUdid(udid)) {
    throw new SimulatorRefused('invalid', '"udid" must be a simulator identifier.');
  }
  return udid;
}

async function listDevices(): Promise<SimulatorDevice[]> {
  const { stdout } = await simctl(['list', 'devices', 'available', '--json']);
  try {
    return readSimulatorDevices(JSON.parse(stdout));
  } catch {
    throw new SimulatorRefused('failed', SIMULATOR_UNAVAILABLE_MESSAGES.failed);
  }
}

async function requireDevice(udid: unknown): Promise<SimulatorDevice> {
  const wanted = requireUdid(udid);
  const device = (await listDevices()).find((entry) => entry.udid === wanted);
  if (!device) throw new SimulatorRefused('not-found', UNKNOWN_DEVICE);
  return device;
}

async function requireBooted(udid: unknown): Promise<SimulatorDevice> {
  const device = await requireDevice(udid);
  if (!device.booted) throw new SimulatorRefused('not-found', NOT_RUNNING);
  return device;
}

function captureKind(file: string): SimulatorCaptureKind | null {
  if (file.endsWith(SCREENSHOT_EXTENSION)) return 'screenshot';
  if (file.endsWith(RECORDING_EXTENSION)) return 'recording';
  return null;
}

async function listCaptures(): Promise<SimulatorCapture[]> {
  const directory = tools.capturesDir();
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const captures: SimulatorCapture[] = [];
  for (const name of names) {
    const kind = captureKind(name);
    const id = path.parse(name).name;
    if (kind === null || !isSimulatorCaptureId(id) || id === recording?.id) continue;
    const file = path.join(directory, name);
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      captures.push({ id, kind, path: file, createdAtMs: info.mtimeMs, bytes: info.size });
    } catch {
      continue;
    }
  }
  return captures.sort((left, right) => right.createdAtMs - left.createdAtMs);
}

async function requireCapture(id: unknown): Promise<SimulatorCapture> {
  if (!isSimulatorCaptureId(id)) {
    throw new SimulatorRefused('invalid', '"id" must name a saved capture.');
  }
  const capture = (await listCaptures()).find((entry) => entry.id === id);
  if (!capture) throw new SimulatorRefused('not-found', UNKNOWN_CAPTURE);
  return capture;
}

async function roomForCapture(): Promise<string> {
  const directory = tools.capturesDir();
  await mkdir(directory, { recursive: true });
  if ((await listCaptures()).length >= SIMULATOR_CAPTURE_LIMIT) {
    throw new SimulatorRefused('busy', CAPTURES_FULL);
  }
  return directory;
}

function unavailable(reason: SimulatorUnavailableReason): SimulatorStatus {
  return {
    available: false,
    unavailableReason: reason,
    devices: [],
    recording: null,
    captures: [],
  };
}

export async function simulatorStatus(): Promise<SimulatorStatus> {
  if (!simulatorSupported()) return unavailable('unsupported-platform');
  let devices: SimulatorDevice[];
  try {
    const { stdout } = await tools.run(['list', 'devices', 'available', '--json']);
    devices = readSimulatorDevices(JSON.parse(stdout));
  } catch (error) {
    return unavailable(unavailableReason(error));
  }
  return {
    available: true,
    unavailableReason: null,
    devices,
    recording: recording ? { udid: recording.udid, startedAtMs: recording.startedAtMs } : null,
    captures: await listCaptures(),
  };
}

async function announce(): Promise<SimulatorStatus> {
  const status = await simulatorStatus();
  onChange(status);
  return status;
}

export async function bootSimulator(udid: unknown): Promise<SimulatorStatus> {
  const device = await requireDevice(udid);
  if (!device.booted) {
    try {
      await tools.run(['boot', device.udid], { timeoutMs: BOOT_TIMEOUT_MS });
    } catch (error) {
      if (!(error instanceof SimctlFailed) || !ALREADY_IN_STATE.test(error.stderr)) {
        throw refusal(error);
      }
    }
  }
  return announce();
}

export async function shutdownSimulator(udid: unknown): Promise<SimulatorStatus> {
  const device = await requireDevice(udid);
  if (recording?.udid === device.udid) await stopSimulatorRecording();
  if (device.booted) {
    try {
      await tools.run(['shutdown', device.udid], { timeoutMs: BOOT_TIMEOUT_MS });
    } catch (error) {
      if (!(error instanceof SimctlFailed) || !ALREADY_IN_STATE.test(error.stderr)) {
        throw refusal(error);
      }
    }
  }
  return announce();
}

/**
 * This Xcode writes a screenshot named "-" to a file of that name rather than
 * to standard output, whatever its help says, so a frame goes through a file.
 * One capture per device at a time: a caller that asks while one is being
 * taken gets that one.
 */
export async function simulatorFrame(udid: unknown): Promise<SimulatorFrame> {
  const device = requireUdid(udid);
  return framesInFlight.get(device) ?? startFrame(device);
}

function startFrame(device: string): Promise<SimulatorFrame> {
  const frame = (async (): Promise<SimulatorFrame> => {
    const directory = tools.capturesDir();
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${FRAME_FILE_PREFIX}${device}.jpg`);
    try {
      await simctl(['io', device, 'screenshot', '--type=jpeg', file]);
      const bytes = await readFile(file);
      return {
        dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
        takenAtMs: tools.now(),
      };
    } finally {
      await rm(file, { force: true });
    }
  })();
  framesInFlight.set(device, frame);
  const forget = (): void => {
    framesInFlight.delete(device);
  };
  frame.then(forget, forget);
  return frame;
}

function readStatusBar(listing: string): SimulatorStatusBar {
  const [, ...overrides] = listing.split(/^=+$/m);
  return overrides.join('').trim() === '' ? 'live' : 'clean';
}

export async function simulatorSettings(udid: unknown): Promise<SimulatorSettings> {
  const device = await requireBooted(udid);
  const [appearance, statusBar] = await Promise.all([
    simctl(['ui', device.udid, 'appearance']),
    simctl(['status_bar', device.udid, 'list']),
  ]);
  const style = appearance.stdout.trim();
  return {
    appearance: style === 'light' || style === 'dark' ? style : null,
    statusBar: readStatusBar(statusBar.stdout),
  };
}

export async function setSimulatorAppearance(
  udid: unknown,
  appearance: SimulatorAppearance,
): Promise<SimulatorSettings> {
  const device = await requireBooted(udid);
  await simctl(['ui', device.udid, 'appearance', appearance]);
  return simulatorSettings(device.udid);
}

export async function setSimulatorStatusBar(
  udid: unknown,
  statusBar: SimulatorStatusBar,
): Promise<SimulatorSettings> {
  const device = await requireBooted(udid);
  await simctl(
    statusBar === 'clean'
      ? ['status_bar', device.udid, 'override', ...CLEAN_STATUS_BAR]
      : ['status_bar', device.udid, 'clear'],
  );
  return simulatorSettings(device.udid);
}

/**
 * simctl has no Home button, and from iOS 16 it cannot bring the home screen
 * forward by name. Opening the system Settings app and closing it again leaves
 * the home screen in front with the app that was open behind it.
 */
export async function pressSimulatorHome(udid: unknown): Promise<boolean> {
  const device = await requireBooted(udid);
  await simctl(['launch', device.udid, SETTINGS_APP]);
  await simctl(['terminate', device.udid, SETTINGS_APP]);
  return true;
}

export async function takeSimulatorScreenshot(udid: unknown): Promise<SimulatorCapture> {
  const device = await requireBooted(udid);
  const directory = await roomForCapture();
  const id = randomUUID();
  const file = path.join(directory, `${id}${SCREENSHOT_EXTENSION}`);
  await simctl(['io', device.udid, 'screenshot', '--type=png', file]);
  const capture = await requireCapture(id);
  await announce();
  return capture;
}

export async function startSimulatorRecording(udid: unknown): Promise<SimulatorStatus> {
  if (recording) throw new SimulatorRefused('busy', ALREADY_RECORDING);
  const device = await requireBooted(udid);
  const directory = await roomForCapture();
  if (recording) throw new SimulatorRefused('busy', ALREADY_RECORDING);
  const id = randomUUID();
  const file = path.join(directory, `${id}${RECORDING_EXTENSION}`);
  const process = tools.record(['io', device.udid, 'recordVideo', '--codec=h264', '--force', file]);
  const active: ActiveRecording = {
    id,
    udid: device.udid,
    startedAtMs: tools.now(),
    process,
    limit: setTimeout(() => void stopSimulatorRecording(), SIMULATOR_RECORDING_LIMIT_MS),
  };
  recording = active;
  const gaveUp = setTimeout(() => process.kill(), RECORDING_START_TIMEOUT_MS);
  try {
    await process.started;
  } catch (error) {
    clearTimeout(active.limit);
    if (recording === active) recording = null;
    await rm(file, { force: true });
    const cause = refusal(error);
    throw cause.reason === 'failed'
      ? new SimulatorRefused('failed', RECORDING_DID_NOT_START)
      : cause;
  } finally {
    clearTimeout(gaveUp);
  }
  active.startedAtMs = tools.now();
  void process.finished.then(() => {
    if (recording !== active) return;
    clearTimeout(active.limit);
    recording = null;
    void announce();
  });
  return announce();
}

export async function stopSimulatorRecording(): Promise<SimulatorStatus> {
  const active = recording;
  if (!active) return simulatorStatus();
  clearTimeout(active.limit);
  const forced = setTimeout(() => active.process.kill(), RECORDING_STOP_TIMEOUT_MS);
  active.process.stop();
  await active.process.finished;
  clearTimeout(forced);
  if (recording === active) recording = null;
  return announce();
}

export function simulatorRecordingActive(): boolean {
  return recording !== null;
}

/** Ends a recording at quit without waiting, so the file is closed rather than cut off. */
export function shutDownSimulator(): void {
  if (!recording) return;
  clearTimeout(recording.limit);
  recording.process.stop();
  recording = null;
}

/**
 * The simulator's clipboard text goes onto this Mac's clipboard and nowhere
 * else: the page that asked is told how much moved, never what it was.
 */
export async function copySimulatorClipboard(udid: unknown): Promise<SimulatorClipboardResult> {
  const device = await requireBooted(udid);
  const { stdout } = await simctl(['pbpaste', device.udid]);
  const text = stdout.slice(0, SIMULATOR_CLIPBOARD_TEXT_LIMIT);
  if (text !== '') await tools.writeClipboard(text);
  return { characters: text.length };
}

export async function sendClipboardToSimulator(udid: unknown): Promise<SimulatorClipboardResult> {
  const device = await requireBooted(udid);
  const text = (await tools.readClipboard()).slice(0, SIMULATOR_CLIPBOARD_TEXT_LIMIT);
  if (text === '') return { characters: 0 };
  await simctl(['pbcopy', device.udid], { input: text });
  return { characters: text.length };
}

export async function readSimulatorCapture(id: unknown): Promise<SimulatorCaptureImage> {
  const capture = await requireCapture(id);
  if (capture.kind !== 'screenshot') throw new SimulatorRefused('invalid', NOT_A_SCREENSHOT);
  const bytes = await readFile(capture.path);
  return {
    dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
    name: path.basename(capture.path),
  };
}

export async function revealSimulatorCapture(id: unknown): Promise<boolean> {
  const capture = await requireCapture(id);
  tools.reveal(capture.path);
  return true;
}

export async function deleteSimulatorCapture(id: unknown): Promise<SimulatorStatus> {
  const capture = await requireCapture(id);
  await rm(capture.path, { force: true });
  return announce();
}
