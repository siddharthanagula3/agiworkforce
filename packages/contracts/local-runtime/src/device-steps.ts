import { DESKTOP_CAPABILITIES, type DesktopCapability } from './capabilities';

/**
 * The steps a cloud turn may hand back to the machine the user is sitting at.
 *
 * A cloud turn runs in a data centre and can reach nothing on the user's disk.
 * When the page is hosted by the desktop shell, the model may instead ask for a
 * step the shell carries out through the privileged local runtime, under the
 * permission prompts that already gate every other local command. The cloud
 * side never executes one and never sees a path it was not handed back.
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
] as const;

export type DeviceStepTool = (typeof DEVICE_STEP_TOOLS)[number];

export function isDeviceStepTool(name: string): name is DeviceStepTool {
  return (DEVICE_STEP_TOOLS as readonly string[]).includes(name);
}

export interface DeviceStepDefinition {
  command: string;
  capability: DesktopCapability;
  description: string;
}

export const DEVICE_STEP_DEFINITIONS: Readonly<Record<DeviceStepTool, DeviceStepDefinition>> = {
  device_read_file: {
    command: 'file_read_text',
    capability: 'filesystem.read',
    description:
      "Read a text file from a folder the user granted on their desktop. Call list_device_folders first, or use a rootId the user's message already named. Returns the file text, truncated when large.",
  },
  device_list_folder: {
    command: 'file_list',
    capability: 'filesystem.read',
    description:
      'List the entries of a folder the user granted on their desktop. Use it to find a file before reading it.',
  },
  device_write_file: {
    command: 'file_write_text',
    capability: 'filesystem.write',
    description:
      'Create or replace a text file inside a folder the user granted on their desktop. The whole file is replaced by the text supplied.',
  },
  device_run_command: {
    command: 'shell_run',
    capability: 'shell.execute',
    description:
      "Run one command inside a folder the user granted on their desktop. The user approves the exact command before it starts. Returns the command's output and exit code.",
  },
};

export function deviceStepCapability(tool: DeviceStepTool): DesktopCapability {
  return DEVICE_STEP_DEFINITIONS[tool].capability;
}

export function deviceStepCommand(tool: DeviceStepTool): string {
  return DEVICE_STEP_DEFINITIONS[tool].command;
}

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
 * spend a turn to reach a refusal the server already knew about. A declaration
 * with no granted folder yields nothing at all, because every step is scoped to
 * a root.
 */
export function offeredDeviceStepTools(
  declaration: DesktopHostDeclaration,
): readonly DeviceStepTool[] {
  if (declaration.roots.length === 0) return [];
  const granted = new Set(declaration.capabilities);
  return DEVICE_STEP_TOOLS.filter((tool) => granted.has(deviceStepCapability(tool)));
}

export interface DeviceStepRequest {
  tool: DeviceStepTool;
  rootId: string;
  path?: string;
  text?: string;
  command?: string;
}

export class DeviceStepRefused extends Error {
  readonly reason: 'unknown-tool' | 'unknown-root' | 'invalid-arguments';

  constructor(reason: DeviceStepRefused['reason'], message: string) {
    super(message);
    this.name = 'DeviceStepRefused';
    this.reason = reason;
  }
}

/**
 * Turns the model's arguments into a step the device can run, or refuses.
 *
 * The root is checked against the declaration the same client sent, so a model
 * that invents a folder id is refused before the shell is asked, and the
 * refusal reaches the model as an ordinary tool error it can recover from.
 */
export function planDeviceStep(
  tool: string,
  args: Record<string, unknown>,
  roots: readonly DeviceStepRoot[],
): DeviceStepRequest {
  if (!isDeviceStepTool(tool)) {
    throw new DeviceStepRefused('unknown-tool', `"${tool}" is not a device step.`);
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
  }
}
