import type { SimulatorCaptureKind } from '@agiworkforce/local-runtime-contract';

const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * 1024;
const SECONDS_PER_MINUTE = 60;

function characters(count: number): string {
  return count === 1 ? '1 character' : `${count.toLocaleString()} characters`;
}

export const SIMULATOR_PANE_COPY = {
  pane: 'iOS Simulator',
  loading: 'Looking for the iOS Simulator',
  tryAgain: 'Try again',
  statusFailed: 'The iOS Simulator could not be reached.',
  permissionNeeded:
    "This pane needs permission to use the iOS Simulator. If you refused it, you can allow it again in Settings, under the desktop app's permissions.",
  noDevices: "No simulators are installed. You can add one in Xcode's settings, under Components.",
  startSimulator: 'Start simulator',
  starting: 'Starting the simulator. This can take a minute or more.',
  memoryNote: 'A running simulator uses several gigabytes of memory.',
  notRunning: (name: string) => `${name} is not running.`,
  screenAlt: 'The live screen of the simulator',
  screenWaiting: 'Waiting for the first picture of the screen',
  screenStale: (reason: string) => `The screen is not updating. ${reason}`,
  frameFailed: 'The simulator did not send a picture.',

  editMenu: 'Edit',
  copyFromSimulator: "Copy the simulator's clipboard to this Mac",
  sendToSimulator: "Send this Mac's clipboard to the simulator",
  clipboardCopied: (count: number) => `Copied ${characters(count)} from the simulator to this Mac.`,
  clipboardSent: (count: number) => `Sent ${characters(count)} from this Mac to the simulator.`,
  clipboardEmptyFromSimulator: "The simulator's clipboard has no text to copy.",
  clipboardEmptyToSimulator: "This Mac's clipboard has no text to send.",
  copyFailed: "The simulator's clipboard could not be copied.",
  sendFailed: "This Mac's clipboard could not be sent.",

  deviceMenu: 'Device',
  appearance: 'Appearance',
  appearanceOptions: { light: 'Light', dark: 'Dark' },
  appearanceFailed: 'The appearance could not be changed.',
  statusBar: 'Status bar',
  statusBarOptions: { live: 'Live', clean: 'Clean' },
  statusBarHints: {
    live: 'Shows the real time and signal.',
    clean: '9:41, full signal and battery.',
  },
  statusBarFailed: 'The status bar could not be changed.',
  settingsFailed: "The simulator's settings could not be read.",
  shutDown: 'Shut down',
  shutDownTitle: 'Shut down this simulator?',
  shutDownDescription:
    'The simulator closes and the apps running in it stop. Anything they have not saved is lost. You can start it again from this pane.',
  shutDownDone: 'The simulator was shut down.',
  shutDownFailed: 'The simulator could not be shut down.',

  viewMenu: 'View',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Zoom to fit',
  zoomLevel: (percent: number) => `Zoom ${percent}%`,
  zoomAtMaximum: 'Already at the largest size',
  zoomAtMinimum: 'Already at the smallest size',
  zoomAtFit: 'Already fitted to the pane',

  chooseDevice: 'Choose a device',
  running: 'Running',
  bootFailed: 'The simulator could not be started.',

  floatPane: 'Float over the chat',
  expandPane: 'Expand to the full width',
  closePane: 'Close the simulator',
  phoneOnly: 'Show only the phone',
  showControls: 'Show controls',
  dock: 'Dock',
  close: 'Close',

  tools: 'Simulator tools',
  home: 'Home',
  homeHint: 'Go to the home screen. This closes the Settings app if it is open.',
  homeFailed: 'The Home button press did not reach the simulator.',
  screenshot: 'Screenshot',
  screenshotDone: 'Screenshot saved.',
  screenshotFailed: 'The screenshot could not be taken or opened.',
  record: 'Record',
  recordFailed: 'The recording could not be started.',
  recordingSaved: 'Recording saved.',
  stopRecording: 'Stop',
  stopRecordingLabel: 'Stop recording',
  stopFailed: 'The recording could not be stopped.',
  recordingTime: 'Recording time',
  annotate: 'Annotate',

  latestCapture: 'Latest capture',
  thumbnailAlt: 'The latest screenshot',
  captureKinds: { screenshot: 'Screenshot', recording: 'Recording' } satisfies Record<
    SimulatorCaptureKind,
    string
  >,
  captureActions: (label: string) => `Actions for ${label}`,
  addToChat: 'Add to chat',
  addedToChat: 'The screenshot was added to the chat.',
  copyPath: 'Copy path',
  pathCopied: 'The path was copied.',
  pathCopyFailed: 'The path could not be copied.',
  showInFinder: 'Show in Finder',
  revealFailed: 'The file could not be shown in Finder.',
  deleteCapture: 'Delete',
  deleteTitle: 'Delete this capture?',
  deleteDescription: 'The file is removed from this Mac and cannot be brought back.',
  deleteDone: 'The capture was deleted.',
  deleteFailed: 'The capture could not be deleted.',
  captureReadFailed: 'The capture could not be opened.',
  savedCaptures: (count: number) => `Saved captures (${count})`,
  cancel: 'Cancel',
} as const;

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatCaptureSize(bytes: number): string {
  if (bytes < BYTES_PER_KILOBYTE) return `${bytes} B`;
  if (bytes < BYTES_PER_MEGABYTE) return `${Math.round(bytes / BYTES_PER_KILOBYTE)} KB`;
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

export function formatCaptureTime(createdAtMs: number, nowMs: number = Date.now()): string {
  const created = new Date(createdAtMs);
  const sameDay = created.toDateString() === new Date(nowMs).toDateString();
  return sameDay
    ? created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : created.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}
