'use client';

import {
  DesktopRuntimeError,
  MAX_DEVICE_STEP_RESULT_LENGTH,
  describeDeviceDisplays,
  deviceStepCommand,
  getHostBridge,
  isDeviceStepTool,
  type DesktopHostDeclaration,
  type DeviceScreenDisplay,
  type DeviceStepTool,
  type FileEntry,
  type FileStat,
  type FileTextContent,
  type ShellRunResult,
} from '@agiworkforce/local-runtime-contract';
import { DesktopHostUnavailable } from './runtime-client';

/**
 * Carrying out a step the cloud handed back to this machine.
 *
 * Nothing here decides whether a step may run. Every command goes through the
 * same privileged runtime the desktop UI uses, so the capability grant, the
 * per-command prompt, and the workspace containment that already govern a local
 * command govern this too. What this module adds is the shape of the answer the
 * model reads back.
 */

export interface DeviceStepOutcome {
  content: string;
  isError: boolean;
  /** A screen capture, when the step produced one, for the model to look at. */
  image?: { base64: string; mimeType: 'image/png' | 'image/jpeg' };
}

interface ScreenCaptureResult {
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  scaleFactor: number;
  displayName: string;
  displayId?: number;
  displays?: DeviceScreenDisplay[];
}

async function invokeDeviceCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const host = getHostBridge();
  if (!host) throw new DesktopHostUnavailable();
  const response = await host.invokeRuntime<T>(command, args);
  if (!response.ok) throw new DesktopRuntimeError(response.error);
  return response.value;
}

export async function readDeviceHostDeclaration(): Promise<DesktopHostDeclaration | null> {
  const host = getHostBridge();
  if (!host) return null;
  const response = await host.invokeRuntime<DesktopHostDeclaration>('device_host_declaration');
  return response.ok ? response.value : null;
}

function cap(text: string): string {
  return text.length > MAX_DEVICE_STEP_RESULT_LENGTH
    ? `${text.slice(0, MAX_DEVICE_STEP_RESULT_LENGTH)}\n[truncated]`
    : text;
}

function describeEntries(entries: FileEntry[]): string {
  if (entries.length === 0) return '(the folder is empty)';
  return entries
    .map((entry) => (entry.kind === 'directory' ? `${entry.path}/` : `${entry.path}`))
    .join('\n');
}

function describeCommandRun(result: ShellRunResult): string {
  const parts = [`exit ${result.exitCode ?? result.signal ?? 'unknown'}`];
  if (result.timedOut) parts.push('the command timed out');
  if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
  if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
  if (result.truncated) parts.push('[output truncated]');
  return parts.join('\n\n');
}

async function captureFor(
  tool: 'device_screenshot' | 'device_zoom',
  input: Record<string, unknown>,
): Promise<DeviceStepOutcome> {
  const capture = await invokeDeviceCommand<ScreenCaptureResult>(
    deviceStepCommand(tool),
    tool === 'device_zoom'
      ? { region: input['region'] }
      : typeof input['display'] === 'number'
        ? { display: input['display'] }
        : {},
  );
  const displays =
    tool === 'device_screenshot' && capture.displays && capture.displayId !== undefined
      ? describeDeviceDisplays(capture.displays, capture.displayId)
      : '';
  return {
    content:
      tool === 'device_zoom'
        ? `A ${capture.width} by ${capture.height} close-up of ${capture.displayName} follows. Its coordinates are the region asked for, not the whole screen.`
        : `${capture.displayName} is ${capture.width} wide and ${capture.height} tall in the coordinates every other screen step uses.${displays ? ` ${displays}` : ''} The picture follows.`,
    isError: false,
    image: { base64: capture.imageBase64, mimeType: capture.mimeType },
  };
}

type ActionStepTool = Exclude<DeviceStepTool, 'device_screenshot' | 'device_zoom'>;

async function runStep(tool: ActionStepTool, input: Record<string, unknown>): Promise<string> {
  const command = deviceStepCommand(tool);
  switch (tool) {
    case 'device_move':
      await invokeDeviceCommand<true>(command, { x: input['x'], y: input['y'] });
      return `Moved the pointer to ${String(input['x'])}, ${String(input['y'])}.`;
    case 'device_click':
      await invokeDeviceCommand<true>(command, {
        x: input['x'],
        y: input['y'],
        button: input['button'],
        count: input['count'],
      });
      return `Clicked at ${String(input['x'])}, ${String(input['y'])}. Take a screenshot to see what changed.`;
    case 'device_drag':
      await invokeDeviceCommand<true>(command, {
        x: input['x'],
        y: input['y'],
        toX: input['toX'],
        toY: input['toY'],
      });
      return `Dragged to ${String(input['toX'])}, ${String(input['toY'])}. Take a screenshot to see what changed.`;
    case 'device_scroll':
      await invokeDeviceCommand<true>(command, {
        x: input['x'],
        y: input['y'],
        deltaX: input['deltaX'],
        deltaY: input['deltaY'],
      });
      return 'Scrolled. Take a screenshot to see what is on screen now.';
    case 'device_type':
      await invokeDeviceCommand<true>(command, { text: input['text'] });
      return 'Typed the text into whatever had keyboard focus. Take a screenshot to check it landed where you meant.';
    case 'device_key':
      await invokeDeviceCommand<true>(command, {
        key: input['key'],
        modifiers: input['modifiers'],
      });
      return 'Pressed the key. Take a screenshot to see what changed.';
    case 'device_wait':
      await invokeDeviceCommand<true>(command, { ms: input['ms'] });
      return 'Waited. Take a screenshot to see the screen now.';
    case 'device_read_file': {
      const file = await invokeDeviceCommand<FileTextContent>(command, {
        rootId: input['rootId'],
        path: input['path'],
      });
      return file.truncated ? `${file.text}\n[truncated]` : file.text;
    }
    case 'device_list_folder': {
      const entries = await invokeDeviceCommand<FileEntry[]>(command, {
        rootId: input['rootId'],
        ...(typeof input['path'] === 'string' ? { path: input['path'] } : {}),
      });
      return describeEntries(entries);
    }
    case 'device_write_file': {
      const stat = await invokeDeviceCommand<FileStat>(command, {
        rootId: input['rootId'],
        path: input['path'],
        text: input['text'],
      });
      return `Wrote ${stat.path} (${stat.sizeBytes} bytes).`;
    }
    case 'device_run_command': {
      const result = await invokeDeviceCommand<ShellRunResult>(command, {
        runId: crypto.randomUUID(),
        rootId: input['rootId'],
        command: input['command'],
        ...(typeof input['path'] === 'string' ? { path: input['path'] } : {}),
      });
      return describeCommandRun(result);
    }
  }
}

/**
 * Runs one step and turns every outcome into something the model can act on.
 *
 * A refusal is a result, not a thrown error: the turn is already paused waiting
 * for this answer, so failing to send one strands it. The model is told what
 * the user's machine said so it can ask for something else or explain.
 */
export async function executeDeviceStep(
  tool: string,
  input: Record<string, unknown>,
): Promise<DeviceStepOutcome> {
  if (!isDeviceStepTool(tool)) {
    return { content: `"${tool}" is not a step this device runs.`, isError: true };
  }
  try {
    if (tool === 'device_screenshot' || tool === 'device_zoom') {
      return await captureFor(tool, input);
    }
    return { content: cap(await runStep(tool, input)), isError: false };
  } catch (error) {
    if (error instanceof DesktopRuntimeError) {
      return { content: cap(error.message), isError: true };
    }
    if (error instanceof DesktopHostUnavailable) {
      return { content: error.message, isError: true };
    }
    return { content: 'That step could not be run on this device.', isError: true };
  }
}
