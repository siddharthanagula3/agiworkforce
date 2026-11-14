export const SIMULATOR_COMMANDS = [
  'simulator_supported',
  'simulator_status',
  'simulator_boot',
  'simulator_shutdown',
  'simulator_frame',
  'simulator_settings',
  'simulator_set_appearance',
  'simulator_set_status_bar',
  'simulator_home',
  'simulator_screenshot',
  'simulator_record_start',
  'simulator_record_stop',
  'simulator_clipboard_get',
  'simulator_clipboard_send',
  'simulator_capture_read',
  'simulator_capture_reveal',
  'simulator_capture_delete',
] as const;

export type SimulatorCommand = (typeof SIMULATOR_COMMANDS)[number];

export function isSimulatorCommand(command: string): command is SimulatorCommand {
  return (SIMULATOR_COMMANDS as readonly string[]).includes(command);
}

export const SIMULATOR_UNAVAILABLE_REASONS = [
  'unsupported-platform',
  'xcode-missing',
  'xcode-license',
  'failed',
] as const;

export type SimulatorUnavailableReason = (typeof SIMULATOR_UNAVAILABLE_REASONS)[number];

export const SIMULATOR_UNAVAILABLE_MESSAGES: Readonly<Record<SimulatorUnavailableReason, string>> =
  {
    'unsupported-platform': 'The iOS Simulator runs only on a Mac.',
    'xcode-missing':
      'Xcode is not installed, or its command line tools point somewhere else. Install Xcode from the App Store, open it once, then run "sudo xcode-select -s /Applications/Xcode.app" in Terminal.',
    'xcode-license':
      'Xcode is installed but its licence has not been accepted. Open Xcode once, or run "sudo xcodebuild -license" in Terminal, then try again.',
    failed: 'The iOS Simulator did not answer. Check that Xcode opens, then try again.',
  };

export interface SimulatorDevice {
  udid: string;
  name: string;
  /** The system it runs, as people say it: "iOS 26.5". */
  runtime: string;
  booted: boolean;
}

export const SIMULATOR_APPEARANCES = ['light', 'dark'] as const;

export type SimulatorAppearance = (typeof SIMULATOR_APPEARANCES)[number];

export function isSimulatorAppearance(value: unknown): value is SimulatorAppearance {
  return typeof value === 'string' && (SIMULATOR_APPEARANCES as readonly string[]).includes(value);
}

export const SIMULATOR_STATUS_BARS = ['live', 'clean'] as const;

export type SimulatorStatusBar = (typeof SIMULATOR_STATUS_BARS)[number];

export function isSimulatorStatusBar(value: unknown): value is SimulatorStatusBar {
  return typeof value === 'string' && (SIMULATOR_STATUS_BARS as readonly string[]).includes(value);
}

export interface SimulatorSettings {
  /** Null where the device cannot say, as on a system older than appearance styles. */
  appearance: SimulatorAppearance | null;
  statusBar: SimulatorStatusBar;
}

export const SIMULATOR_CAPTURE_KINDS = ['screenshot', 'recording'] as const;

export type SimulatorCaptureKind = (typeof SIMULATOR_CAPTURE_KINDS)[number];

export interface SimulatorCapture {
  id: string;
  kind: SimulatorCaptureKind;
  /** Where the file is on this Mac. */
  path: string;
  createdAtMs: number;
  bytes: number;
}

export interface SimulatorRecording {
  udid: string;
  startedAtMs: number;
}

export interface SimulatorStatus {
  available: boolean;
  unavailableReason: SimulatorUnavailableReason | null;
  devices: SimulatorDevice[];
  recording: SimulatorRecording | null;
  captures: SimulatorCapture[];
}

export interface SimulatorFrame {
  /** A JPEG of the device's screen, as a data URL. */
  dataUrl: string;
  takenAtMs: number;
}

export interface SimulatorCaptureImage {
  /** A PNG screenshot, as a data URL. */
  dataUrl: string;
  name: string;
}

export interface SimulatorClipboardResult {
  /** How many characters moved. Zero means the source held no text. */
  characters: number;
}

export const SIMULATOR_CAPTURE_LIMIT = 40;
export const SIMULATOR_RECORDING_LIMIT_MS = 10 * 60_000;
export const SIMULATOR_CLIPBOARD_TEXT_LIMIT = 500_000;
export const SIMULATOR_FRAME_INTERVAL_MS = 500;

const UDID = /^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/;

export function isSimulatorUdid(value: unknown): value is string {
  return typeof value === 'string' && UDID.test(value);
}

const CAPTURE_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function isSimulatorCaptureId(value: unknown): value is string {
  return typeof value === 'string' && CAPTURE_ID.test(value);
}

const IOS_RUNTIME = /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)(?:-(\d+))?(?:-(\d+))?$/;

/** "iOS 26.5" for an iOS runtime identifier, or null for any other system. */
export function simulatorRuntimeLabel(identifier: string): string | null {
  const match = IOS_RUNTIME.exec(identifier);
  if (!match) return null;
  return `iOS ${[match[1], match[2], match[3]].filter((part) => part !== undefined).join('.')}`;
}

interface ListedDevice {
  udid?: unknown;
  name?: unknown;
  state?: unknown;
  isAvailable?: unknown;
}

/**
 * The iOS devices `simctl list devices --json` reports as usable, booted ones
 * first, then by system and name. Anything that is not an available iOS device
 * with a well-formed identifier is left out.
 */
export function readSimulatorDevices(listing: unknown): SimulatorDevice[] {
  if (!listing || typeof listing !== 'object') return [];
  const groups = (listing as { devices?: unknown }).devices;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return [];
  const devices: SimulatorDevice[] = [];
  for (const [identifier, entries] of Object.entries(groups as Record<string, unknown>)) {
    const runtime = simulatorRuntimeLabel(identifier);
    if (runtime === null || !Array.isArray(entries)) continue;
    for (const entry of entries as ListedDevice[]) {
      if (!entry || typeof entry !== 'object' || entry.isAvailable !== true) continue;
      if (!isSimulatorUdid(entry.udid) || typeof entry.name !== 'string' || entry.name === '') {
        continue;
      }
      devices.push({
        udid: entry.udid,
        name: entry.name,
        runtime,
        booted: entry.state === 'Booted',
      });
    }
  }
  return devices.sort(
    (left, right) =>
      Number(right.booted) - Number(left.booted) ||
      right.runtime.localeCompare(left.runtime, undefined, { numeric: true }) ||
      left.name.localeCompare(right.name, undefined, { numeric: true }),
  );
}
