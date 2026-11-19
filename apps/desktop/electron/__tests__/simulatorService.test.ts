import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIMULATOR_CAPTURE_LIMIT,
  SIMULATOR_CLIPBOARD_TEXT_LIMIT,
  SIMULATOR_RECORDING_LIMIT_MS,
  SIMULATOR_UNAVAILABLE_MESSAGES,
  type SimulatorStatus,
} from '@agiworkforce/local-runtime-contract';
import type { SimctlOutput, SimctlRecording, SimulatorTools } from '../runtime/simulatorService';

const electronState = vi.hoisted(() => ({ userData: '' }));
const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: { getPath: () => electronState.userData },
  clipboard: { readText: vi.fn(() => ''), writeText: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
}));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

type ServiceModule = typeof import('../runtime/simulatorService');

const IOS = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';
const PHONE = 'A1B2C3D4-0000-4000-8000-000000000001';
const TABLET = 'A1B2C3D4-0000-4000-8000-000000000002';
const GONE = 'A1B2C3D4-0000-4000-8000-0000000000FF';
const LIVE_BAR =
  'Current Status Bar Overrides:\n=============================\n=============================\n';
const CLEAN_BAR =
  'Current Status Bar Overrides:\n=============================\nTime: 9:41\nBattery Level: 100\n=============================\n';
const SCREENSHOT_BYTES = Buffer.from('png-bytes');
const FRAME_BYTES = Buffer.from('jpeg-bytes');

interface FakeDevice {
  udid: string;
  name: string;
  booted: boolean;
}

interface World {
  devices: FakeDevice[];
  appearance: string;
  statusBar: string;
  deviceClipboard: string;
  macClipboard: string;
  clockMs: number;
  frameGate: Promise<void>;
  recordOutcome: 'started' | Error;
  failNext: Error | null;
}

interface FakeRecording extends SimctlRecording {
  stop: ReturnType<typeof vi.fn<() => void>>;
  kill: ReturnType<typeof vi.fn<() => void>>;
  end(): void;
  file: string;
}

let root: string;
let capturesDir: string;
let world: World;
let service: ServiceModule;
let onChange: ReturnType<typeof vi.fn<(status: SimulatorStatus) => void>>;
let runs: string[][];
let recordings: FakeRecording[];
let tools: SimulatorTools;
let runMock: ReturnType<typeof vi.fn<SimulatorTools['run']>>;
let writeClipboard: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
let reveal: ReturnType<typeof vi.fn<(file: string) => void>>;

function listing() {
  return {
    devices: {
      [IOS]: world.devices.map((device) => ({
        udid: device.udid,
        name: device.name,
        state: device.booted ? 'Booted' : 'Shutdown',
        isAvailable: true,
      })),
    },
  };
}

const out = (stdout = ''): SimctlOutput => ({ stdout, stderr: '' });

async function simulate(
  args: string[],
  options?: { input?: string; timeoutMs?: number },
): Promise<SimctlOutput> {
  runs.push(args);
  if (world.failNext) {
    const error = world.failNext;
    world.failNext = null;
    throw error;
  }
  const [verb, udid, third] = args;
  const target = world.devices.find((device) => device.udid === udid);
  if (verb === 'list') return out(JSON.stringify(listing()));
  if (verb === 'boot' && target) target.booted = true;
  if (verb === 'shutdown' && target) target.booted = false;
  if (verb === 'io' && third === 'screenshot') {
    await world.frameGate;
    const file = args[args.length - 1] ?? '';
    await writeFile(file, args.includes('--type=jpeg') ? FRAME_BYTES : SCREENSHOT_BYTES);
    return out();
  }
  if (verb === 'ui' && args.length === 3) return out(`${world.appearance}\n`);
  if (verb === 'ui' && args.length === 4) world.appearance = args[3] ?? '';
  if (verb === 'status_bar' && third === 'list') return out(world.statusBar);
  if (verb === 'status_bar' && third === 'override') world.statusBar = CLEAN_BAR;
  if (verb === 'status_bar' && third === 'clear') world.statusBar = LIVE_BAR;
  if (verb === 'pbpaste') return out(world.deviceClipboard);
  if (verb === 'pbcopy') world.deviceClipboard = options?.input ?? '';
  return out();
}

function fakeRecording(file: string): FakeRecording {
  let end!: () => void;
  const finished = new Promise<void>((resolve) => {
    end = resolve;
  });
  const started =
    world.recordOutcome === 'started' ? Promise.resolve() : Promise.reject(world.recordOutcome);
  started.catch(() => undefined);
  return {
    started,
    finished,
    stop: vi.fn(() => end()),
    kill: vi.fn(() => end()),
    end,
    file,
  };
}

function buildTools(platform: NodeJS.Platform): SimulatorTools {
  runMock = vi.fn(simulate);
  writeClipboard = vi.fn(async (text: string) => {
    world.macClipboard = text;
  });
  reveal = vi.fn();
  return {
    platform,
    run: runMock,
    record: vi.fn((args: string[]) => {
      const file = args[args.length - 1] ?? '';
      writeFileSync(file, 'mov');
      const recording = fakeRecording(file);
      recordings.push(recording);
      return recording;
    }),
    capturesDir: () => capturesDir,
    readClipboard: async () => world.macClipboard,
    writeClipboard,
    reveal,
    now: () => world.clockMs,
  };
}

async function load(platform: NodeJS.Platform = 'darwin'): Promise<void> {
  vi.resetModules();
  service = await import('../runtime/simulatorService');
  tools = buildTools(platform);
  service.configureSimulator({ onChange, tools });
}

async function plantCapture(extension: '.png' | '.mov', ageMs = 0): Promise<string> {
  await mkdir(capturesDir, { recursive: true });
  const id = randomUUID();
  const file = path.join(capturesDir, `${id}${extension}`);
  await writeFile(file, `${extension} body`);
  const moment = new Date(Date.now() - ageMs);
  await utimes(file, moment, moment);
  return id;
}

async function refusalOf(action: () => unknown): Promise<string> {
  try {
    await Promise.resolve().then(action);
  } catch (error) {
    if (error instanceof service.SimulatorRefused) return error.reason;
    throw error;
  }
  return 'did-not-throw';
}

async function filesLeft(): Promise<string[]> {
  return (await readdir(capturesDir).catch(() => [])).sort();
}

const lastStatus = (): SimulatorStatus | undefined => onChange.mock.calls.at(-1)?.[0];

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'agi-simulator-'));
  capturesDir = path.join(root, 'captures');
  electronState.userData = root;
  runs = [];
  recordings = [];
  onChange = vi.fn();
  world = {
    devices: [
      { udid: PHONE, name: 'iPhone 17 Pro', booted: true },
      { udid: TABLET, name: 'iPad Pro', booted: false },
    ],
    appearance: 'light',
    statusBar: LIVE_BAR,
    deviceClipboard: '',
    macClipboard: '',
    clockMs: 1_700_000_000_000,
    frameGate: Promise.resolve(),
    recordOutcome: 'started',
    failNext: null,
  };
  spawnMock.mockReset();
  await load();
});

afterEach(async () => {
  service.shutDownSimulator();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe('off macOS', () => {
  beforeEach(async () => {
    await load('linux');
  });

  it('reports the platform as unsupported and runs nothing', async () => {
    expect(service.simulatorSupported()).toBe(false);

    expect(await service.simulatorStatus()).toEqual({
      available: false,
      unavailableReason: 'unsupported-platform',
      devices: [],
      recording: null,
      captures: [],
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('refuses every other call as unsupported, runs nothing, and writes no file', async () => {
    const calls: Array<() => unknown> = [
      () => service.bootSimulator(PHONE),
      () => service.shutdownSimulator(PHONE),
      () => service.simulatorFrame(PHONE),
      () => service.simulatorSettings(PHONE),
      () => service.setSimulatorAppearance(PHONE, 'dark'),
      () => service.setSimulatorStatusBar(PHONE, 'clean'),
      () => service.pressSimulatorHome(PHONE),
      () => service.takeSimulatorScreenshot(PHONE),
      () => service.startSimulatorRecording(PHONE),
      () => service.copySimulatorClipboard(PHONE),
      () => service.sendClipboardToSimulator(PHONE),
    ];
    for (const call of calls) expect(await refusalOf(call), String(call)).toBe('unsupported');

    expect(runMock).not.toHaveBeenCalled();
    expect(tools.record).not.toHaveBeenCalled();
    expect(await filesLeft()).toEqual([]);
  });
});

describe('when the simulator cannot be reached', () => {
  it('reports a failed answer from the tool as the simulator not answering', async () => {
    world.failNext = new Error('xcrun: error: unable to find utility "simctl"');

    expect(await service.simulatorStatus()).toMatchObject({
      available: false,
      unavailableReason: 'failed',
      devices: [],
    });
  });

  it('reports a listing that is not JSON as the simulator not answering', async () => {
    runMock.mockResolvedValueOnce(out('not json'));

    expect(await service.simulatorStatus()).toMatchObject({
      available: false,
      unavailableReason: 'failed',
    });
  });

  it('refuses a call as failed, with the message a person can act on', async () => {
    world.failNext = new Error('boom');

    const error = await service.bootSimulator(TABLET).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(service.SimulatorRefused);
    expect(error).toMatchObject({
      reason: 'failed',
      message: SIMULATOR_UNAVAILABLE_MESSAGES.failed,
    });
  });
});

describe('the status of the simulator', () => {
  it('lists the devices of the listing, booted first', async () => {
    const status = await service.simulatorStatus();

    expect(runs[0]).toEqual(['list', 'devices', 'available', '--json']);
    expect(status).toMatchObject({ available: true, unavailableReason: null, recording: null });
    expect(status.devices).toEqual([
      { udid: PHONE, name: 'iPhone 17 Pro', runtime: 'iOS 26.5', booted: true },
      { udid: TABLET, name: 'iPad Pro', runtime: 'iOS 26.5', booted: false },
    ]);
  });

  it('has no captures before the folder exists', async () => {
    expect((await service.simulatorStatus()).captures).toEqual([]);
    expect(existsSync(capturesDir)).toBe(false);
  });

  it('lists captures newest first, ignoring strays and folders that look like captures', async () => {
    const oldest = await plantCapture('.png', 3 * 60_000);
    const newest = await plantCapture('.mov', 0);
    const middle = await plantCapture('.png', 60_000);
    await writeFile(path.join(capturesDir, 'notes.txt'), 'x');
    await writeFile(path.join(capturesDir, `${PHONE}.png`), 'x');
    await writeFile(path.join(capturesDir, 'not-an-id.png'), 'x');
    await writeFile(path.join(capturesDir, `${randomUUID()}.jpg`), 'x');
    await writeFile(path.join(capturesDir, `.frame-${PHONE}.jpg`), 'x');
    await mkdir(path.join(capturesDir, `${randomUUID()}.png`));

    const { captures } = await service.simulatorStatus();

    expect(captures.map((capture) => capture.id)).toEqual([newest, middle, oldest]);
    expect(captures.map((capture) => capture.kind)).toEqual([
      'recording',
      'screenshot',
      'screenshot',
    ]);
    expect(captures[1]).toMatchObject({
      path: path.join(capturesDir, `${middle}.png`),
      bytes: '.png body'.length,
    });
    expect(captures[1]?.createdAtMs).toBeGreaterThan(0);
  });

  it('shows a recording that is running and leaves its file out of the captures', async () => {
    await plantCapture('.png');
    await service.startSimulatorRecording(PHONE);

    const status = await service.simulatorStatus();

    expect(status.recording).toEqual({ udid: PHONE, startedAtMs: world.clockMs });
    expect(status.captures).toHaveLength(1);
    expect(status.captures.every((capture) => capture.kind === 'screenshot')).toBe(true);
    expect(readdirSync(capturesDir).filter((name) => name.endsWith('.mov'))).toHaveLength(1);
  });
});

describe('booting and shutting down', () => {
  it('boots a device that is shut down, with time to start, and announces the status', async () => {
    const status = await service.bootSimulator(TABLET);

    expect(runMock).toHaveBeenCalledWith(['boot', TABLET], { timeoutMs: 180_000 });
    expect(status.devices.find((device) => device.udid === TABLET)?.booted).toBe(true);
    expect(lastStatus()).toEqual(status);
  });

  it('boots nothing that is already running, and still announces', async () => {
    await service.bootSimulator(PHONE);

    expect(runs.some(([verb]) => verb === 'boot')).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('shuts a running device down, and leaves a stopped one', async () => {
    await service.shutdownSimulator(PHONE);
    expect(runMock).toHaveBeenCalledWith(['shutdown', PHONE], { timeoutMs: 180_000 });
    expect(lastStatus()?.devices.find((device) => device.udid === PHONE)?.booted).toBe(false);

    runs.length = 0;
    await service.shutdownSimulator(TABLET);
    expect(runs.some(([verb]) => verb === 'shutdown')).toBe(false);
  });

  it('ends a recording of the device before shutting it down', async () => {
    await service.startSimulatorRecording(PHONE);

    await service.shutdownSimulator(PHONE);

    expect(recordings[0]?.stop).toHaveBeenCalledOnce();
    expect(service.simulatorRecordingActive()).toBe(false);
    expect(recordings[0]?.stop.mock.invocationCallOrder[0]).toBeLessThan(
      runMock.mock.invocationCallOrder[
        runMock.mock.calls.findIndex(([args]) => args[0] === 'shutdown')
      ] ?? 0,
    );
  });

  it('keeps a recording of another device running when a device shuts down', async () => {
    world.devices[1]!.booted = true;
    await service.startSimulatorRecording(PHONE);

    await service.shutdownSimulator(TABLET);

    expect(recordings[0]?.stop).not.toHaveBeenCalled();
    expect(service.simulatorRecordingActive()).toBe(true);
  });

  it('refuses a device that is malformed or no longer on this Mac', async () => {
    expect(await refusalOf(() => service.bootSimulator('booted'))).toBe('invalid');
    expect(await refusalOf(() => service.bootSimulator(undefined))).toBe('invalid');
    expect(await refusalOf(() => service.bootSimulator(GONE))).toBe('not-found');
    expect(runs.some(([verb]) => verb === 'boot')).toBe(false);
  });
});

describe('the frame of a device', () => {
  const frameFiles = async () => (await filesLeft()).filter((name) => name.startsWith('.frame-'));

  it('is taken through a file under the captures folder, never to standard output', async () => {
    const frame = await service.simulatorFrame(PHONE);

    const call = runs.find(([verb, , third]) => verb === 'io' && third === 'screenshot') ?? [];
    expect(call.slice(0, 4)).toEqual(['io', PHONE, 'screenshot', '--type=jpeg']);
    expect(call).not.toContain('-');
    const file = call[4] ?? '';
    expect(path.dirname(file)).toBe(capturesDir);
    expect(path.basename(file)).toBe(`.frame-${PHONE}.jpg`);
    expect(frame).toEqual({
      dataUrl: `data:image/jpeg;base64,${FRAME_BYTES.toString('base64')}`,
      takenAtMs: world.clockMs,
    });
  });

  it('leaves no file behind, whether the capture worked or not', async () => {
    await service.simulatorFrame(PHONE);
    expect(await frameFiles()).toEqual([]);

    world.failNext = new Error('boom');
    expect(await refusalOf(() => service.simulatorFrame(PHONE))).toBe('failed');
    expect(await frameFiles()).toEqual([]);
  });

  it('is not listed as a capture while it exists', async () => {
    let gate!: () => void;
    world.frameGate = new Promise<void>((resolve) => {
      gate = resolve;
    });
    const pending = service.simulatorFrame(PHONE);
    await vi.waitFor(() => expect(runs.some(([verb]) => verb === 'io')).toBe(true));

    expect((await service.simulatorStatus()).captures).toEqual([]);

    gate();
    await pending;
  });

  it('is taken once for a device however many ask while it is taken', async () => {
    let gate!: () => void;
    world.frameGate = new Promise<void>((resolve) => {
      gate = resolve;
    });

    const first = service.simulatorFrame(PHONE);
    const second = service.simulatorFrame(PHONE);
    await vi.waitFor(() => expect(runs.filter(([verb]) => verb === 'io')).toHaveLength(1));
    gate();

    const frames = await Promise.all([first, second]);
    expect(frames[0]).toEqual(frames[1]);
    expect(runs.filter(([verb]) => verb === 'io')).toHaveLength(1);

    await service.simulatorFrame(PHONE);
    expect(runs.filter(([verb]) => verb === 'io')).toHaveLength(2);
  });

  it('is taken separately for each device', async () => {
    world.devices[1]!.booted = true;

    await Promise.all([service.simulatorFrame(PHONE), service.simulatorFrame(TABLET)]);

    expect(runs.filter(([verb]) => verb === 'io')).toHaveLength(2);
  });

  it('can be asked for again after one failed', async () => {
    world.failNext = new Error('boom');
    await refusalOf(() => service.simulatorFrame(PHONE));

    const frame = await service.simulatorFrame(PHONE);

    expect(frame.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('is refused for a malformed device before anything runs', async () => {
    expect(await refusalOf(() => service.simulatorFrame('../../etc'))).toBe('invalid');
    expect(runs).toEqual([]);
  });
});

describe('a screenshot', () => {
  it('is refused for a device that is not running', async () => {
    expect(await refusalOf(() => service.takeSimulatorScreenshot(TABLET))).toBe('not-found');
    expect(runs.some(([verb]) => verb === 'io')).toBe(false);
    expect(await filesLeft()).toEqual([]);
  });

  it('is refused once the folder holds as many captures as it may', async () => {
    for (let index = 0; index < SIMULATOR_CAPTURE_LIMIT - 1; index += 1) await plantCapture('.png');
    await plantCapture('.mov');

    expect(await refusalOf(() => service.takeSimulatorScreenshot(PHONE))).toBe('busy');
    expect(runs.some(([verb]) => verb === 'io')).toBe(false);
    expect(await filesLeft()).toHaveLength(SIMULATOR_CAPTURE_LIMIT);
  });

  it('is saved as <id>.png in the captures folder and announced', async () => {
    const capture = await service.takeSimulatorScreenshot(PHONE);

    expect(capture.id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(capture).toMatchObject({
      kind: 'screenshot',
      path: path.join(capturesDir, `${capture.id}.png`),
      bytes: SCREENSHOT_BYTES.length,
    });
    expect(runs).toContainEqual(['io', PHONE, 'screenshot', '--type=png', capture.path]);
    expect((await stat(capture.path)).isFile()).toBe(true);
    expect(lastStatus()?.captures.map((entry) => entry.id)).toEqual([capture.id]);
  });
});

describe('a recording', () => {
  it('starts recordVideo as h264, waits for it to start, and says so in the status', async () => {
    const status = await service.startSimulatorRecording(PHONE);

    expect(tools.record).toHaveBeenCalledOnce();
    const args = vi.mocked(tools.record).mock.calls[0]?.[0] ?? [];
    expect(args.slice(0, 4)).toEqual(['io', PHONE, 'recordVideo', '--codec=h264']);
    expect(args).toContain('--force');
    expect(path.dirname(args.at(-1) ?? '')).toBe(capturesDir);
    expect(args.at(-1)).toMatch(/\.mov$/);
    expect(status.recording).toEqual({ udid: PHONE, startedAtMs: world.clockMs });
    expect(lastStatus()?.recording).toEqual({ udid: PHONE, startedAtMs: world.clockMs });
    expect(service.simulatorRecordingActive()).toBe(true);
  });

  it('is refused for a device that is not running, or one that is not on this Mac', async () => {
    expect(await refusalOf(() => service.startSimulatorRecording(TABLET))).toBe('not-found');
    expect(await refusalOf(() => service.startSimulatorRecording(GONE))).toBe('not-found');
    expect(await refusalOf(() => service.startSimulatorRecording('x'))).toBe('invalid');
    expect(tools.record).not.toHaveBeenCalled();
  });

  it('is refused when the folder is full', async () => {
    for (let index = 0; index < SIMULATOR_CAPTURE_LIMIT; index += 1) await plantCapture('.png');

    expect(await refusalOf(() => service.startSimulatorRecording(PHONE))).toBe('busy');
    expect(tools.record).not.toHaveBeenCalled();
  });

  it('is not started a second time while one runs, for any device', async () => {
    world.devices[1]!.booted = true;
    await service.startSimulatorRecording(PHONE);

    expect(await refusalOf(() => service.startSimulatorRecording(PHONE))).toBe('busy');
    expect(await refusalOf(() => service.startSimulatorRecording(TABLET))).toBe('busy');
    expect(tools.record).toHaveBeenCalledOnce();
  });

  it('is not started twice by two calls made together', async () => {
    const results = await Promise.all([
      refusalOf(() => service.startSimulatorRecording(PHONE)),
      refusalOf(() => service.startSimulatorRecording(PHONE)),
    ]);

    expect(results.sort()).toEqual(['busy', 'did-not-throw']);
    expect(tools.record).toHaveBeenCalledOnce();
  });

  it('is stopped by asking the tool to stop and waiting for it to finish', async () => {
    await service.startSimulatorRecording(PHONE);
    onChange.mockClear();

    const status = await service.stopSimulatorRecording();

    expect(recordings[0]?.stop).toHaveBeenCalledOnce();
    expect(recordings[0]?.kill).not.toHaveBeenCalled();
    expect(status.recording).toBeNull();
    expect(lastStatus()?.recording).toBeNull();
    expect(service.simulatorRecordingActive()).toBe(false);
    expect(status.captures.map((capture) => capture.kind)).toEqual(['recording']);
  });

  it('can be started again once it was stopped', async () => {
    await service.startSimulatorRecording(PHONE);
    await service.stopSimulatorRecording();

    await service.startSimulatorRecording(PHONE);

    expect(tools.record).toHaveBeenCalledTimes(2);
  });

  it('stops nothing when none runs, and still answers with the status', async () => {
    const status = await service.stopSimulatorRecording();

    expect(status.available).toBe(true);
    expect(status.recording).toBeNull();
  });

  it('clears itself, and says so, when the tool ends on its own', async () => {
    await service.startSimulatorRecording(PHONE);
    onChange.mockClear();

    recordings[0]?.end();

    await vi.waitFor(() => expect(lastStatus()?.recording).toBeNull());
    expect(service.simulatorRecordingActive()).toBe(false);
    expect(recordings[0]?.stop).not.toHaveBeenCalled();
  });

  it('cleans up and refuses when the tool gives up before it starts', async () => {
    world.recordOutcome = new Error('device went away');

    expect(await refusalOf(() => service.startSimulatorRecording(PHONE))).toBe('failed');

    expect(service.simulatorRecordingActive()).toBe(false);
    expect(await filesLeft()).toEqual([]);
    world.recordOutcome = 'started';
    await service.startSimulatorRecording(PHONE);
    expect(service.simulatorRecordingActive()).toBe(true);
  });

  it('is ended after the longest a recording may run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await service.startSimulatorRecording(PHONE);

    await vi.advanceTimersByTimeAsync(SIMULATOR_RECORDING_LIMIT_MS - 1);
    expect(recordings[0]?.stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(recordings[0]?.stop).toHaveBeenCalledOnce();
  });

  it('is ended without waiting when the app quits, so the file is closed', async () => {
    await service.startSimulatorRecording(PHONE);

    service.shutDownSimulator();

    expect(recordings[0]?.stop).toHaveBeenCalledOnce();
    expect(service.simulatorRecordingActive()).toBe(false);
    service.shutDownSimulator();
    expect(recordings[0]?.stop).toHaveBeenCalledOnce();
  });
});

describe('the look of a device', () => {
  it('reads the appearance and whether the status bar is overridden', async () => {
    expect(await service.simulatorSettings(PHONE)).toEqual({
      appearance: 'light',
      statusBar: 'live',
    });
    expect(runs).toContainEqual(['ui', PHONE, 'appearance']);
    expect(runs).toContainEqual(['status_bar', PHONE, 'list']);

    world.appearance = 'dark';
    world.statusBar = CLEAN_BAR;
    expect(await service.simulatorSettings(PHONE)).toEqual({
      appearance: 'dark',
      statusBar: 'clean',
    });
  });

  it('reports no appearance when the device cannot say', async () => {
    world.appearance = 'unsupported';

    expect((await service.simulatorSettings(PHONE)).appearance).toBeNull();
  });

  it('reports the status bar as live when the override list has no entries', async () => {
    world.statusBar =
      'Current Status Bar Overrides:\n=============================\n\n=============================\n';

    expect((await service.simulatorSettings(PHONE)).statusBar).toBe('live');
  });

  it('sets the appearance with the exact arguments and reads it back', async () => {
    const settings = await service.setSimulatorAppearance(PHONE, 'dark');

    expect(runs).toContainEqual(['ui', PHONE, 'appearance', 'dark']);
    expect(settings.appearance).toBe('dark');
  });

  it('overrides the status bar with a clean one, and clears the override', async () => {
    const clean = await service.setSimulatorStatusBar(PHONE, 'clean');

    const override = runs.find(([verb, , third]) => verb === 'status_bar' && third === 'override');
    expect(override?.slice(0, 4)).toEqual(['status_bar', PHONE, 'override', '--time']);
    expect(override).toEqual(expect.arrayContaining(['9:41', '--batteryState', 'charged']));
    expect(clean.statusBar).toBe('clean');

    const live = await service.setSimulatorStatusBar(PHONE, 'live');
    expect(runs).toContainEqual(['status_bar', PHONE, 'clear']);
    expect(live.statusBar).toBe('live');
  });

  it('changes nothing on a device that is not running', async () => {
    expect(await refusalOf(() => service.setSimulatorAppearance(TABLET, 'dark'))).toBe('not-found');
    expect(await refusalOf(() => service.setSimulatorStatusBar(TABLET, 'clean'))).toBe('not-found');
    expect(await refusalOf(() => service.simulatorSettings(TABLET))).toBe('not-found');
    expect(runs.every(([verb]) => verb === 'list')).toBe(true);
  });

  it('goes to the home screen by opening the Settings app and closing it again', async () => {
    expect(await service.pressSimulatorHome(PHONE)).toBe(true);

    const steps = runs.filter(([verb]) => verb === 'launch' || verb === 'terminate');
    expect(steps).toEqual([
      ['launch', PHONE, 'com.apple.Preferences'],
      ['terminate', PHONE, 'com.apple.Preferences'],
    ]);
    expect(await refusalOf(() => service.pressSimulatorHome(TABLET))).toBe('not-found');
  });
});

describe('the clipboard', () => {
  it('copies the text of the device onto this Mac and tells only how much moved', async () => {
    world.deviceClipboard = 'a secret token';

    const result = await service.copySimulatorClipboard(PHONE);

    expect(runs).toContainEqual(['pbpaste', PHONE]);
    expect(writeClipboard).toHaveBeenCalledWith('a secret token');
    expect(result).toEqual({ characters: 'a secret token'.length });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('leaves the clipboard of this Mac alone when the device holds no text', async () => {
    world.macClipboard = 'mine';

    expect(await service.copySimulatorClipboard(PHONE)).toEqual({ characters: 0 });

    expect(writeClipboard).not.toHaveBeenCalled();
    expect(world.macClipboard).toBe('mine');
  });

  it('copies no more than the limit', async () => {
    world.deviceClipboard = 'x'.repeat(SIMULATOR_CLIPBOARD_TEXT_LIMIT + 10);

    const result = await service.copySimulatorClipboard(PHONE);

    expect(result.characters).toBe(SIMULATOR_CLIPBOARD_TEXT_LIMIT);
    expect(writeClipboard.mock.calls[0]?.[0]).toHaveLength(SIMULATOR_CLIPBOARD_TEXT_LIMIT);
  });

  it('sends the clipboard of this Mac to the device as input to pbcopy', async () => {
    world.macClipboard = 'from the Mac';

    const result = await service.sendClipboardToSimulator(PHONE);

    expect(runMock).toHaveBeenCalledWith(['pbcopy', PHONE], { input: 'from the Mac' });
    expect(world.deviceClipboard).toBe('from the Mac');
    expect(result).toEqual({ characters: 'from the Mac'.length });
  });

  it('sends nothing when the clipboard of this Mac is empty', async () => {
    world.deviceClipboard = 'kept';

    expect(await service.sendClipboardToSimulator(PHONE)).toEqual({ characters: 0 });

    expect(runs.some(([verb]) => verb === 'pbcopy')).toBe(false);
    expect(world.deviceClipboard).toBe('kept');
  });

  it('moves nothing for a device that is not running', async () => {
    world.macClipboard = 'x';
    expect(await refusalOf(() => service.sendClipboardToSimulator(TABLET))).toBe('not-found');
    expect(await refusalOf(() => service.copySimulatorClipboard(TABLET))).toBe('not-found');
    expect(runs.some(([verb]) => verb === 'pbcopy' || verb === 'pbpaste')).toBe(false);
  });
});

describe('saved captures', () => {
  it('reads a screenshot as a PNG data URL under its file name', async () => {
    const id = await plantCapture('.png');

    expect(await service.readSimulatorCapture(id)).toEqual({
      dataUrl: `data:image/png;base64,${Buffer.from('.png body').toString('base64')}`,
      name: `${id}.png`,
    });
  });

  it('refuses to read a recording as an image', async () => {
    const id = await plantCapture('.mov');

    expect(await refusalOf(() => service.readSimulatorCapture(id))).toBe('invalid');
  });

  it('reveals and deletes a capture that exists, and announces the deletion', async () => {
    const keep = await plantCapture('.png');
    const doomed = await plantCapture('.mov');

    expect(await service.revealSimulatorCapture(doomed)).toBe(true);
    expect(reveal).toHaveBeenCalledWith(path.join(capturesDir, `${doomed}.mov`));

    const status = await service.deleteSimulatorCapture(doomed);

    expect(await filesLeft()).toEqual([`${keep}.png`]);
    expect(status.captures.map((capture) => capture.id)).toEqual([keep]);
    expect(lastStatus()).toEqual(status);
  });

  it('refuses an id that names no capture, and touches no file', async () => {
    const keep = await plantCapture('.png');
    const absent = randomUUID();

    for (const act of [
      () => service.readSimulatorCapture(absent),
      () => service.revealSimulatorCapture(absent),
      () => service.deleteSimulatorCapture(absent),
    ]) {
      expect(await refusalOf(act)).toBe('not-found');
    }

    expect(reveal).not.toHaveBeenCalled();
    expect(await filesLeft()).toEqual([`${keep}.png`]);
  });

  it('refuses a malformed id as invalid and touches no file, even one outside the folder', async () => {
    const keep = await plantCapture('.png');
    const outside = randomUUID();
    await writeFile(path.join(root, `${outside}.png`), 'private');
    await writeFile(path.join(root, 'passwd'), 'private');

    for (const id of [
      '../../etc/passwd',
      `../${outside}`,
      `${outside}.png`,
      `${keep}/../${keep}`,
      keep.toUpperCase(),
      '',
      undefined,
      42,
      null,
    ]) {
      for (const act of [
        () => service.readSimulatorCapture(id),
        () => service.revealSimulatorCapture(id),
        () => service.deleteSimulatorCapture(id),
      ]) {
        expect(await refusalOf(act), String(id)).toBe('invalid');
      }
    }

    expect(reveal).not.toHaveBeenCalled();
    expect(existsSync(path.join(root, `${outside}.png`))).toBe(true);
    expect(existsSync(path.join(root, 'passwd'))).toBe(true);
    expect(await filesLeft()).toEqual([`${keep}.png`]);
  });
});

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    kill: vi.fn(),
  });
}

describe('the real tool, with the process it would start replaced', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  type Script = (child: FakeChild, args: string[]) => void;

  const systemCapturesDir = () => path.join(root, 'simulator-captures');

  function scripted(script: Script): FakeChild[] {
    const children: FakeChild[] = [];
    spawnMock.mockImplementation((_program: string, args: string[]) => {
      const child = fakeChild();
      children.push(child);
      setImmediate(() => script(child, args.slice(1)));
      return child;
    });
    return children;
  }

  const finish = (child: FakeChild, code: number, stdout = '', stderr = '') => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', code);
  };

  const listed = (devices: FakeDevice[]) =>
    JSON.stringify({
      devices: {
        [IOS]: devices.map((device) => ({
          udid: device.udid,
          name: device.name,
          state: device.booted ? 'Booted' : 'Shutdown',
          isAvailable: true,
        })),
      },
    });

  beforeEach(async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.resetModules();
    service = await import('../runtime/simulatorService');
    service.configureSimulator({ onChange });
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('starts xcrun simctl with the arguments it was given, through a pipe, never a shell', async () => {
    scripted((child) => finish(child, 0, listed(world.devices)));

    const status = await service.simulatorStatus();

    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/bin/xcrun',
      ['simctl', 'list', 'devices', 'available', '--json'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    expect(status.available).toBe(true);
    expect(status.devices).toHaveLength(2);
  });

  it('reports a missing xcrun as Xcode not installed', async () => {
    scripted((child) =>
      child.emit(
        'error',
        Object.assign(new Error('spawn /usr/bin/xcrun ENOENT'), { code: 'ENOENT' }),
      ),
    );

    expect(await service.simulatorStatus()).toMatchObject({
      available: false,
      unavailableReason: 'xcode-missing',
    });
  });

  it.each([
    [
      'xcode-missing',
      "xcode-select: error: tool 'simctl' requires Xcode, but active developer directory is a command line tools instance",
    ],
    [
      'xcode-missing',
      'xcrun: error: unable to find utility "simctl", not a developer tool or in PATH',
    ],
    [
      'xcode-license',
      'Agreeing to the Xcode/iOS license requires admin privileges, please run "sudo xcodebuild -license"',
    ],
    ['failed', 'something nobody planned for'],
  ])('reports %s when xcrun says: %s', async (reason, said) => {
    scripted((child) => finish(child, 69, '', said));

    expect(await service.simulatorStatus()).toMatchObject({
      available: false,
      unavailableReason: reason,
    });
  });

  it('refuses a call as unavailable, with the message for that reason, when Xcode is missing', async () => {
    scripted((child) => finish(child, 72, '', 'xcode-select: error: tool simctl requires Xcode'));

    const error = await service.bootSimulator(PHONE).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(service.SimulatorRefused);
    expect(error).toMatchObject({
      reason: 'unavailable',
      message: SIMULATOR_UNAVAILABLE_MESSAGES['xcode-missing'],
    });
  });

  it('treats a boot that lost a race to another boot as booted', async () => {
    const devices = world.devices.map((device) => ({ ...device }));
    scripted((child, args) => {
      if (args[0] === 'boot') {
        const target = devices.find((device) => device.udid === args[1]);
        if (target) target.booted = true;
        finish(
          child,
          164,
          '',
          'An error was encountered processing the command: Unable to boot device in current state: Booted',
        );
      } else finish(child, 0, listed(devices));
    });

    const status = await service.bootSimulator(TABLET);

    expect(status.devices.find((device) => device.udid === TABLET)?.booted).toBe(true);
  });

  it('refuses a boot that failed for any other reason', async () => {
    scripted((child, args) => {
      if (args[0] === 'boot') finish(child, 1, '', 'Invalid device: ' + args[1]);
      else finish(child, 0, listed(world.devices));
    });

    expect(await refusalOf(() => service.bootSimulator(TABLET))).toBe('not-found');
  });

  it('passes input on standard input, and nothing when there is none', async () => {
    const children = scripted((child, args) =>
      finish(child, 0, args[0] === 'list' ? listed(world.devices) : ''),
    );
    const clipboardModule = await import('electron');
    vi.mocked(clipboardModule.clipboard.readText).mockReturnValue('hello');

    await service.sendClipboardToSimulator(PHONE);

    const pbcopy = children.find(
      (_child, index) => spawnMock.mock.calls[index]?.[1]?.[1] === 'pbcopy',
    );
    expect(pbcopy?.stdin.end).toHaveBeenCalledWith('hello');
    const listing = children[0];
    expect(listing?.stdin.end).toHaveBeenCalledWith('');
  });

  it('records with stdin and stdout ignored, is started by the tool saying so, and is stopped with SIGINT', async () => {
    const children = scripted((child, args) => {
      if (args[2] === 'recordVideo') child.stderr.emit('data', Buffer.from('Recording started\n'));
      else finish(child, 0, listed(world.devices));
    });

    await service.startSimulatorRecording(PHONE);

    const recordCall = spawnMock.mock.calls.find((call) => call[1]?.[3] === 'recordVideo');
    expect(recordCall?.[1].slice(0, 5)).toEqual([
      'simctl',
      'io',
      PHONE,
      'recordVideo',
      '--codec=h264',
    ]);
    expect(recordCall?.[2]).toEqual({ stdio: ['ignore', 'ignore', 'pipe'] });
    expect(service.simulatorRecordingActive()).toBe(true);

    const recorder = children.find(
      (_child, index) => spawnMock.mock.calls[index]?.[1]?.[3] === 'recordVideo',
    );
    const stopping = service.stopSimulatorRecording();
    await vi.waitFor(() => expect(recorder?.kill).toHaveBeenCalledWith('SIGINT'));
    recorder?.emit('close', 0);
    await stopping;
    expect(service.simulatorRecordingActive()).toBe(false);
  });

  it('refuses a recording that ended before it started, as one that did not start', async () => {
    scripted((child, args) => {
      if (args[2] === 'recordVideo') finish(child, 1, '', 'Failed to start recording');
      else finish(child, 0, listed(world.devices));
    });

    expect(await refusalOf(() => service.startSimulatorRecording(PHONE))).toBe('failed');
    expect(service.simulatorRecordingActive()).toBe(false);
    expect(readdirSync(systemCapturesDir()).filter((name) => name.endsWith('.mov'))).toEqual([]);
  });

  it('refuses a recording that ended over the Xcode licence as unavailable', async () => {
    scripted((child, args) => {
      if (args[2] === 'recordVideo')
        finish(child, 69, '', 'You have not agreed to the Xcode license agreements.');
      else finish(child, 0, listed(world.devices));
    });

    expect(await refusalOf(() => service.startSimulatorRecording(PHONE))).toBe('unavailable');
  });
});
