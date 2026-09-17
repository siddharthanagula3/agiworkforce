import { DESKTOP_CAPABILITIES, type DesktopCapability } from './capabilities';

/**
 * The steps a cloud turn may hand back to the machine the user is sitting at.
 *
 * A cloud turn runs in a data centre and can reach nothing on the user's disk
 * or screen. When the page is hosted by the desktop shell, the model may
 * instead ask for a step the shell carries out through the privileged local
 * runtime, under the permission prompts that already gate every other local
 * command. The cloud side never executes one and never sees a path it was not
 * handed back.
 *
 * Each step names the runtime command it becomes and the capability that
 * command already requires, so a device tool can never reach further than the
 * equivalent action taken from the desktop UI.
 */

export const DEVICE_STEP_TOOLS = [
  'device_read_file',
  'device_list_folder',
  'device_write_file',
  'device_run_command',
  'device_screenshot',
  'device_zoom',
  'device_move',
  'device_click',
  'device_drag',
  'device_scroll',
  'device_type',
  'device_key',
  'device_wait',
] as const;

export type DeviceStepTool = (typeof DEVICE_STEP_TOOLS)[number];

export function isDeviceStepTool(name: string): name is DeviceStepTool {
  return (DEVICE_STEP_TOOLS as readonly string[]).includes(name);
}

/**
 * Whether a step acts on the screen rather than on a granted folder. A
 * transcript uses this to tell a computer-use step (a click, a keystroke, a
 * screenshot) from a file step, which read as entirely different actions to
 * the person watching them.
 */
export function isScreenDeviceStep(name: string): boolean {
  return isDeviceStepTool(name) && DEVICE_STEP_DEFINITIONS[name].scope === 'screen';
}

/**
 * What a step is scoped to.
 *
 * A `workspace` step acts inside one folder the user granted and is refused
 * without a root. A `screen` step acts on the display and the input devices, so
 * it is scoped to the session instead: it needs no folder and must not be
 * withheld from a shell that has granted none.
 */
export type DeviceStepScope = 'workspace' | 'screen';

export interface DeviceStepDefinition {
  command: string;
  capability: DesktopCapability;
  scope: DeviceStepScope;
  description: string;
}

const SCREEN_PREAMBLE =
  'Take device_screenshot first and work from what it returns: coordinates are logical screen pixels with 0,0 at the top left of the screen it reported.';

export const DEVICE_STEP_DEFINITIONS: Readonly<Record<DeviceStepTool, DeviceStepDefinition>> = {
  device_read_file: {
    command: 'file_read_text',
    capability: 'filesystem.read',
    scope: 'workspace',
    description:
      "Read a text file from a folder the user granted on their desktop. Call list_device_folders first, or use a rootId the user's message already named. Returns the file text, truncated when large.",
  },
  device_list_folder: {
    command: 'file_list',
    capability: 'filesystem.read',
    scope: 'workspace',
    description:
      'List the entries of a folder the user granted on their desktop. Use it to find a file before reading it.',
  },
  device_write_file: {
    command: 'file_write_text',
    capability: 'filesystem.write',
    scope: 'workspace',
    description:
      'Create or replace a text file inside a folder the user granted on their desktop. The whole file is replaced by the text supplied.',
  },
  device_run_command: {
    command: 'shell_run',
    capability: 'shell.execute',
    scope: 'workspace',
    description:
      "Run one command inside a folder the user granted on their desktop. The user approves the exact command before it starts. Returns the command's output and exit code.",
  },
  device_screenshot: {
    command: 'computer_screenshot',
    capability: 'computer.use',
    scope: 'screen',
    description:
      "Capture what is on one of the user's screens right now. Returns the picture, the logical width and height of that screen and the list of connected displays. Pass display to capture a different screen; every other screen step is aimed at the screen of the last screenshot, in its coordinates, so take a fresh screenshot after anything that changes the display.",
  },
  device_zoom: {
    command: 'computer_zoom',
    capability: 'computer.use',
    scope: 'screen',
    description: `Capture one rectangle of the screen at full detail, for reading small text or checking a control. ${SCREEN_PREAMBLE}`,
  },
  device_move: {
    command: 'computer_move',
    capability: 'computer.use',
    scope: 'screen',
    description: `Move the pointer without pressing anything, to reveal a hover state. ${SCREEN_PREAMBLE}`,
  },
  device_click: {
    command: 'computer_click',
    capability: 'computer.use',
    scope: 'screen',
    description: `Click the mouse at a point on the screen. Use count for a double or triple click and button for a right click. ${SCREEN_PREAMBLE}`,
  },
  device_drag: {
    command: 'computer_drag',
    capability: 'computer.use',
    scope: 'screen',
    description: `Press the mouse at one point, move to another, and release: drags a file, a selection, a slider or a window. ${SCREEN_PREAMBLE}`,
  },
  device_scroll: {
    command: 'computer_scroll',
    capability: 'computer.use',
    scope: 'screen',
    description: `Scroll the surface under a point. A negative deltaY scrolls up and a positive deltaY scrolls down. ${SCREEN_PREAMBLE}`,
  },
  device_type: {
    command: 'computer_type',
    capability: 'computer.use',
    scope: 'screen',
    description:
      'Type text into whatever has keyboard focus. Click the field first; this types where focus already is and does not move it.',
  },
  device_key: {
    command: 'computer_key',
    capability: 'computer.use',
    scope: 'screen',
    description:
      'Press one key, optionally with modifiers held, for shortcuts and for keys text cannot express such as enter, tab, escape and the arrows.',
  },
  device_wait: {
    command: 'computer_wait',
    capability: 'computer.use',
    scope: 'screen',
    description:
      'Pause before the next step, to let a window open, a page load or an animation settle. Follow it with a fresh screenshot.',
  },
};

export function deviceStepCapability(tool: DeviceStepTool): DesktopCapability {
  return DEVICE_STEP_DEFINITIONS[tool].capability;
}

export function deviceStepCommand(tool: DeviceStepTool): string {
  return DEVICE_STEP_DEFINITIONS[tool].command;
}

export function deviceStepScope(tool: DeviceStepTool): DeviceStepScope {
  return DEVICE_STEP_DEFINITIONS[tool].scope;
}

export const DEVICE_MOUSE_BUTTONS = ['left', 'right'] as const;
export type DeviceMouseButton = (typeof DEVICE_MOUSE_BUTTONS)[number];

export const DEVICE_KEY_MODIFIERS = ['command', 'control', 'option', 'shift'] as const;
export type DeviceKeyModifier = (typeof DEVICE_KEY_MODIFIERS)[number];

/**
 * Keys a step may name, beyond the single printable characters.
 *
 * The list is closed so an unknown key is refused here rather than reaching the
 * device as an unmapped code that silently does nothing.
 */
export const DEVICE_NAMED_KEYS = [
  'enter',
  'tab',
  'escape',
  'space',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
] as const;
export type DeviceNamedKey = (typeof DEVICE_NAMED_KEYS)[number];

export const MAX_DEVICE_COORDINATE = 20_000;
export const MAX_DEVICE_SCROLL_DELTA = 5_000;
export const MAX_DEVICE_TYPE_LENGTH = 4_000;
export const MAX_DEVICE_WAIT_MS = 10_000;
export const MAX_DEVICE_CLICK_COUNT = 3;
export const MAX_DEVICE_DISPLAY_ID = 2 ** 32 - 1;

/**
 * A granted folder as the model sees it. The path is included because a user
 * asking about "my notes folder" means a place, not an opaque id.
 */
export interface DeviceStepRoot {
  id: string;
  name: string;
  path: string;
}

/**
 * What the desktop shell declares about itself on a cloud chat request.
 *
 * This is a CLAIM, not an authorization. It decides only which device tools are
 * offered to the model; every step it produces is still refused or prompted for
 * by the local runtime on the device itself. A browser tab cannot forge its way
 * into running a command by sending this header, because the resulting step has
 * nowhere to execute.
 */
export interface DesktopHostDeclaration {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  capabilities: DesktopCapability[];
  roots: DeviceStepRoot[];
}

export const DEVICE_HOST_HEADER = 'x-agi-device-host';

export const MAX_DEVICE_HOST_HEADER_LENGTH = 4_000;
export const MAX_DEVICE_STEP_ROOTS = 12;
export const MAX_DEVICE_STEP_RESULT_LENGTH = 24_000;
export const DEVICE_STEP_TTL_MINUTES = 15;

const MAX_FIELD_LENGTH = 200;

function readBoundedString(value: unknown, maxLength = MAX_FIELD_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

function readRoot(value: unknown): DeviceStepRoot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = readBoundedString(record['id']);
  const name = readBoundedString(record['name']);
  const path = readBoundedString(record['path'], 1_000);
  if (!id || !name || !path) return null;
  return { id, name, path };
}

/**
 * Parses the declaration a desktop-hosted page sends with a chat request.
 *
 * Everything here is attacker-controllable in the sense that any client can
 * send the header, so the parser bounds every field and drops the whole
 * declaration rather than repairing a malformed one.
 */
export function parseDesktopHostDeclaration(raw: string | null): DesktopHostDeclaration | null {
  if (!raw || raw.length > MAX_DEVICE_HOST_HEADER_LENGTH) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const record = decoded as Record<string, unknown>;

  const deviceId = readBoundedString(record['deviceId']);
  const deviceName = readBoundedString(record['deviceName']);
  const platform = readBoundedString(record['platform']);
  const appVersion = readBoundedString(record['appVersion']);
  if (!deviceId || !deviceName || !platform || !appVersion) return null;

  const rawCapabilities = record['capabilities'];
  if (!Array.isArray(rawCapabilities) || rawCapabilities.length > DESKTOP_CAPABILITIES.length) {
    return null;
  }
  const capabilities = [
    ...new Set(
      rawCapabilities.filter(
        (entry): entry is DesktopCapability =>
          typeof entry === 'string' && (DESKTOP_CAPABILITIES as readonly string[]).includes(entry),
      ),
    ),
  ];

  const rawRoots = record['roots'];
  if (!Array.isArray(rawRoots) || rawRoots.length > MAX_DEVICE_STEP_ROOTS) return null;
  const roots: DeviceStepRoot[] = [];
  for (const entry of rawRoots) {
    const root = readRoot(entry);
    if (root) roots.push(root);
  }

  return { deviceId, deviceName, platform, appVersion, capabilities, roots };
}

export function encodeDesktopHostDeclaration(declaration: DesktopHostDeclaration): string {
  return JSON.stringify({
    deviceId: declaration.deviceId,
    deviceName: declaration.deviceName,
    platform: declaration.platform,
    appVersion: declaration.appVersion,
    capabilities: declaration.capabilities,
    roots: declaration.roots.slice(0, MAX_DEVICE_STEP_ROOTS),
  });
}

/**
 * Which device tools this declaration can actually run.
 *
 * A capability the user has not granted yields no tool: offering one would
 * spend a turn to reach a refusal the server already knew about. A workspace
 * step additionally needs a granted folder, because it is scoped to one; a
 * screen step is not, so no folder is required for it.
 */
export function offeredDeviceStepTools(
  declaration: DesktopHostDeclaration,
): readonly DeviceStepTool[] {
  const granted = new Set(declaration.capabilities);
  return DEVICE_STEP_TOOLS.filter((tool) => {
    const definition = DEVICE_STEP_DEFINITIONS[tool];
    if (definition.scope === 'workspace' && declaration.roots.length === 0) return false;
    return granted.has(definition.capability);
  });
}

export interface DeviceScreenDisplay {
  id: number;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
}

export function describeDeviceDisplays(
  displays: readonly DeviceScreenDisplay[],
  capturedId: number,
): string {
  if (displays.length <= 1) return '';
  const listed = displays
    .map((display) => {
      const marks = [
        display.primary ? 'primary' : null,
        display.id === capturedId ? 'captured' : null,
      ].filter(Boolean);
      const suffix = marks.length > 0 ? `, ${marks.join(', ')}` : '';
      return `display ${display.id} "${display.name}" ${display.width}x${display.height} at ${display.scaleFactor}x${suffix}`;
    })
    .join('; ');
  return `${displays.length} displays are connected: ${listed}. Pass display to device_screenshot to work on another one.`;
}

export interface DeviceStepRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeviceStepRequest {
  tool: DeviceStepTool;
  rootId?: string;
  path?: string;
  text?: string;
  command?: string;
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  button?: DeviceMouseButton;
  count?: number;
  deltaX?: number;
  deltaY?: number;
  key?: string;
  modifiers?: DeviceKeyModifier[];
  ms?: number;
  region?: DeviceStepRegion;
  display?: number;
}

export class DeviceStepRefused extends Error {
  readonly reason: 'unknown-tool' | 'unknown-root' | 'invalid-arguments';

  constructor(reason: DeviceStepRefused['reason'], message: string) {
    super(message);
    this.name = 'DeviceStepRefused';
    this.reason = reason;
  }
}

function refuse(message: string): never {
  throw new DeviceStepRefused('invalid-arguments', message);
}

function readNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    refuse(`"${name}" must be a number.`);
  }
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    refuse(`"${name}" must be between ${min} and ${max}.`);
  }
  return rounded;
}

function readCoordinate(args: Record<string, unknown>, name: string): number {
  return readNumber(args[name], name, 0, MAX_DEVICE_COORDINATE);
}

function readModifiers(value: unknown): DeviceKeyModifier[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > DEVICE_KEY_MODIFIERS.length) {
    refuse('"modifiers" must be a list of command, control, option or shift.');
  }
  const seen = new Set<DeviceKeyModifier>();
  for (const entry of value) {
    if (
      typeof entry !== 'string' ||
      !(DEVICE_KEY_MODIFIERS as readonly string[]).includes(entry.toLowerCase())
    ) {
      refuse('"modifiers" must be a list of command, control, option or shift.');
    }
    seen.add(entry.toLowerCase() as DeviceKeyModifier);
  }
  return [...seen];
}

/**
 * A key name the device can map. One printable character is taken as itself;
 * anything longer must be a named key, so a typo is refused here rather than
 * reaching the device as a keystroke that does nothing.
 */
function readKey(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    refuse('A key step needs a "key".');
  }
  const key = value.toLowerCase();
  if (key.length === 1) return key;
  if ((DEVICE_NAMED_KEYS as readonly string[]).includes(key)) return key;
  refuse(`"${value}" is not a key this device can press.`);
}

function readRegion(value: unknown): DeviceStepRegion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    refuse('A zoom step needs a "region" with x, y, width and height.');
  }
  const record = value as Record<string, unknown>;
  return {
    x: readNumber(record['x'], 'region.x', 0, MAX_DEVICE_COORDINATE),
    y: readNumber(record['y'], 'region.y', 0, MAX_DEVICE_COORDINATE),
    width: readNumber(record['width'], 'region.width', 1, MAX_DEVICE_COORDINATE),
    height: readNumber(record['height'], 'region.height', 1, MAX_DEVICE_COORDINATE),
  };
}

function planScreenStep(tool: DeviceStepTool, args: Record<string, unknown>): DeviceStepRequest {
  switch (tool) {
    case 'device_screenshot': {
      const display = args['display'];
      if (display === undefined || display === null) return { tool };
      return { tool, display: readNumber(display, 'display', 0, MAX_DEVICE_DISPLAY_ID) };
    }
    case 'device_zoom':
      return { tool, region: readRegion(args['region']) };
    case 'device_move':
      return { tool, x: readCoordinate(args, 'x'), y: readCoordinate(args, 'y') };
    case 'device_click': {
      const rawButton = args['button'];
      if (
        rawButton !== undefined &&
        rawButton !== null &&
        (typeof rawButton !== 'string' ||
          !(DEVICE_MOUSE_BUTTONS as readonly string[]).includes(rawButton))
      ) {
        refuse('"button" must be left or right.');
      }
      const button = (rawButton as DeviceMouseButton | undefined) ?? 'left';
      const count =
        args['count'] === undefined || args['count'] === null
          ? 1
          : readNumber(args['count'], 'count', 1, MAX_DEVICE_CLICK_COUNT);
      return {
        tool,
        x: readCoordinate(args, 'x'),
        y: readCoordinate(args, 'y'),
        button,
        count,
      };
    }
    case 'device_drag':
      return {
        tool,
        x: readCoordinate(args, 'x'),
        y: readCoordinate(args, 'y'),
        toX: readCoordinate(args, 'toX'),
        toY: readCoordinate(args, 'toY'),
      };
    case 'device_scroll':
      return {
        tool,
        x: readCoordinate(args, 'x'),
        y: readCoordinate(args, 'y'),
        deltaX: readNumber(
          args['deltaX'] ?? 0,
          'deltaX',
          -MAX_DEVICE_SCROLL_DELTA,
          MAX_DEVICE_SCROLL_DELTA,
        ),
        deltaY: readNumber(
          args['deltaY'] ?? 0,
          'deltaY',
          -MAX_DEVICE_SCROLL_DELTA,
          MAX_DEVICE_SCROLL_DELTA,
        ),
      };
    case 'device_type': {
      const text = args['text'];
      if (typeof text !== 'string' || text.length === 0) {
        refuse('A type step needs "text" to type.');
      }
      if (text.length > MAX_DEVICE_TYPE_LENGTH) {
        refuse(`"text" must be ${MAX_DEVICE_TYPE_LENGTH} characters or fewer.`);
      }
      return { tool, text };
    }
    case 'device_key':
      return { tool, key: readKey(args['key']), modifiers: readModifiers(args['modifiers']) };
    case 'device_wait':
      return { tool, ms: readNumber(args['ms'] ?? 500, 'ms', 0, MAX_DEVICE_WAIT_MS) };
    default:
      refuse(`"${tool}" is not a screen step.`);
  }
}

/**
 * Turns the model's arguments into a step the device can run, or refuses.
 *
 * A workspace root is checked against the declaration the same client sent, so
 * a model that invents a folder id is refused before the shell is asked, and
 * the refusal reaches the model as an ordinary tool error it can recover from.
 * A screen step is bounded here instead: a coordinate that is not a number, or
 * is outside any real display, never becomes an event on the user's machine.
 */
export function planDeviceStep(
  tool: string,
  args: Record<string, unknown>,
  roots: readonly DeviceStepRoot[],
): DeviceStepRequest {
  if (!isDeviceStepTool(tool)) {
    throw new DeviceStepRefused('unknown-tool', `"${tool}" is not a device step.`);
  }
  if (deviceStepScope(tool) === 'screen') {
    return planScreenStep(tool, args);
  }

  const rootId = readBoundedString(args['rootId']);
  if (!rootId) {
    throw new DeviceStepRefused('invalid-arguments', 'A device step needs a "rootId".');
  }
  if (!roots.some((root) => root.id === rootId)) {
    throw new DeviceStepRefused(
      'unknown-root',
      'That folder is not one the user granted on this device.',
    );
  }

  if (tool === 'device_run_command') {
    const command = readBoundedString(args['command'], 2_000);
    if (!command) {
      throw new DeviceStepRefused('invalid-arguments', 'A command step needs a "command".');
    }
    const path = readBoundedString(args['path'], 1_000);
    return { tool, rootId, command, ...(path ? { path } : {}) };
  }

  if (tool === 'device_list_folder') {
    const path = readBoundedString(args['path'], 1_000);
    return { tool, rootId, ...(path ? { path } : {}) };
  }

  const path = readBoundedString(args['path'], 1_000);
  if (!path) {
    throw new DeviceStepRefused('invalid-arguments', `${tool} needs a "path" inside the folder.`);
  }
  if (tool === 'device_write_file') {
    const text = args['text'];
    if (typeof text !== 'string') {
      throw new DeviceStepRefused('invalid-arguments', 'A write step needs "text" to write.');
    }
    return { tool, rootId, path, text };
  }
  return { tool, rootId, path };
}

export function describeDeviceStep(
  request: DeviceStepRequest,
  roots: readonly DeviceStepRoot[],
): string {
  const root = roots.find((entry) => entry.id === request.rootId);
  const where = root ? root.name : 'a granted folder';
  switch (request.tool) {
    case 'device_read_file':
      return `Read ${request.path} in ${where}`;
    case 'device_list_folder':
      return request.path ? `List ${request.path} in ${where}` : `List ${where}`;
    case 'device_write_file':
      return `Write ${request.path} in ${where}`;
    case 'device_run_command':
      return `Run ${request.command} in ${where}`;
    case 'device_screenshot':
      return request.display === undefined
        ? 'Take a screenshot of your screen'
        : `Take a screenshot of display ${request.display}`;
    case 'device_zoom':
      return `Look closely at ${request.region?.width}x${request.region?.height} of your screen at ${request.region?.x}, ${request.region?.y}`;
    case 'device_move':
      return `Move the pointer to ${request.x}, ${request.y}`;
    case 'device_click': {
      const button = request.button === 'right' ? 'Right-click' : 'Click';
      const times = request.count && request.count > 1 ? ` ${request.count} times` : '';
      return `${button}${times} at ${request.x}, ${request.y}`;
    }
    case 'device_drag':
      return `Drag from ${request.x}, ${request.y} to ${request.toX}, ${request.toY}`;
    case 'device_scroll':
      return `Scroll at ${request.x}, ${request.y}`;
    case 'device_type':
      return 'Type into the focused field';
    case 'device_key':
      return `Press ${[...(request.modifiers ?? []), request.key].join('+')}`;
    case 'device_wait':
      return `Wait ${request.ms}ms`;
  }
}
