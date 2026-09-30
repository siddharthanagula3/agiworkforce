'use client';

import {
  BROWSER_STEP_COMMAND,
  DesktopRuntimeError,
  MAX_DEVICE_STEP_RESULT_LENGTH,
  describeDeviceDisplays,
  describeDeviceFrontWindow,
  deviceFrontWindowRefusal,
  deviceStepBrowserCommand,
  deviceStepCommand,
  deviceStepScope,
  getHostBridge,
  isDeviceStepTool,
  isScreenDeviceStep,
  readDeviceFrontWindow,
  type DesktopHostDeclaration,
  type DeviceScreenDisplay,
  type DeviceStepTool,
  type FileEntry,
  type FileSearchMatch,
  type FileStat,
  type FileTextContent,
  type FileTextEdit,
  type BackgroundShellOutput,
  type ShellRunResult,
} from '@agiworkforce/local-runtime-contract';
import { isPhoneStepTool, type PhoneStepTool } from '@agiworkforce/types';
import { noteComputerUseConversation } from './computer-use-conversation';
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
  front?: unknown;
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

const TRUNCATION_MARK = '\n[truncated]';

function cap(text: string): string {
  return text.length > MAX_DEVICE_STEP_RESULT_LENGTH
    ? `${text.slice(0, MAX_DEVICE_STEP_RESULT_LENGTH - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`
    : text;
}

function frontNote(value: unknown): string {
  const front = readDeviceFrontWindow(value);
  if (!front) return '';
  const refusal = deviceFrontWindowRefusal(front);
  return ` In front: ${describeDeviceFrontWindow(front)}.${refusal ? ` ${refusal}` : ''}`;
}

function frontOf(value: unknown): unknown {
  return value && typeof value === 'object' ? (value as { front?: unknown }).front : undefined;
}

function reviewOf(input: Record<string, unknown>): { review?: string } {
  return typeof input['review'] === 'string' ? { review: input['review'] } : {};
}

function describeEntries(entries: FileEntry[]): string {
  if (entries.length === 0) return '(the folder is empty)';
  return entries
    .map((entry) => (entry.kind === 'directory' ? `${entry.path}/` : `${entry.path}`))
    .join('\n');
}

function describeMatches(matches: FileSearchMatch[]): string {
  if (matches.length === 0) return '(no line matches)';
  return matches.map((match) => `${match.path}:${match.line}: ${match.preview}`).join('\n');
}

function describeCommandRun(result: ShellRunResult): string {
  const parts = [`exit ${result.exitCode ?? result.signal ?? 'unknown'}`];
  if (result.timedOut) parts.push('the command timed out');
  if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
  if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
  if (result.truncated) parts.push('[output truncated]');
  return parts.join('\n\n');
}

function describeBackgroundOutput(result: BackgroundShellOutput): string {
  const state = result.running
    ? `runId ${result.runId}, still running`
    : `runId ${result.runId}, ended with exit ${result.exitCode ?? 'unknown'}`;
  const parts = [state];
  if (result.truncated) parts.push('[earlier output dropped]');
  parts.push(result.output ? `output:\n${result.output}` : '(no new output)');
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
        : `${capture.displayName} is ${capture.width} wide and ${capture.height} tall in the coordinates every other screen step uses.${displays ? ` ${displays}` : ''}${frontNote(capture.front)} The picture follows.`,
    isError: false,
    image: { base64: capture.imageBase64, mimeType: capture.mimeType },
  };
}

type BrowserStepTool = Extract<DeviceStepTool, `device_browser_${string}`>;

type ActionStepTool = Exclude<
  DeviceStepTool,
  'device_screenshot' | 'device_zoom' | BrowserStepTool | PhoneStepTool
>;

function isBrowserStepTool(tool: DeviceStepTool): tool is BrowserStepTool {
  return deviceStepScope(tool) === 'browser';
}

function dataUrlImage(value: unknown): DeviceStepOutcome['image'] | null {
  const dataUrl =
    value && typeof value === 'object' ? (value as { dataUrl?: unknown }).dataUrl : undefined;
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  return { base64: match[2], mimeType: match[1] as 'image/png' | 'image/jpeg' };
}

function readPageText(value: unknown): string {
  const page = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const title = typeof page['title'] === 'string' ? page['title'] : '';
  const url = typeof page['url'] === 'string' ? page['url'] : '';
  const text = typeof page['text'] === 'string' ? page['text'] : '';
  return `${title}\n${url}\n\n${text || '(the page has no visible text)'}`;
}

function browserRecordsText(value: unknown, key: 'console' | 'network'): string {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const entries = Array.isArray(record[key]) ? record[key] : [];
  const origin = typeof record['origin'] === 'string' ? record['origin'] : 'the Chrome tab';
  if (entries.length === 0) {
    return key === 'console'
      ? `No console messages matched on ${origin}.`
      : `No network requests matched on ${origin}.`;
  }
  return `${origin}\n\n${JSON.stringify(entries, null, 2)}`;
}

function browserStepArgs(
  tool: BrowserStepTool,
  input: Record<string, unknown>,
): Record<string, unknown> {
  switch (tool) {
    case 'device_browser_navigate':
    case 'device_browser_download':
      return { url: input['url'] };
    case 'device_browser_click':
      return { selector: input['selector'] };
    case 'device_browser_type':
      return { selector: input['selector'], text: input['text'], clear: input['clear'] === true };
    case 'device_browser_console':
      return { pattern: input['pattern'], level: input['level'] };
    case 'device_browser_network':
      return { pattern: input['pattern'], failedOnly: input['failedOnly'] === true };
    case 'device_browser_read_page':
    case 'device_browser_screenshot':
      return {};
  }
}

async function runBrowserStep(
  tool: BrowserStepTool,
  input: Record<string, unknown>,
): Promise<DeviceStepOutcome> {
  const value = await invokeDeviceCommand<unknown>(BROWSER_STEP_COMMAND, {
    command: deviceStepBrowserCommand(tool),
    args: browserStepArgs(tool, input),
    ...reviewOf(input),
    ...(input['siteRules'] ? { siteRules: input['siteRules'] } : {}),
  });
  switch (tool) {
    case 'device_browser_read_page':
      return { content: cap(readPageText(value)), isError: false };
    case 'device_browser_screenshot': {
      const image = dataUrlImage(value);
      return image
        ? { content: 'The visible part of the Chrome tab follows.', isError: false, image }
        : { content: 'Chrome returned no picture of the tab.', isError: true };
    }
    case 'device_browser_navigate':
      return {
        content: `Opened ${String(input['url'])} in Chrome. Read the page to see what loaded.`,
        isError: false,
      };
    case 'device_browser_click':
      return {
        content: `Clicked ${String(input['selector'])} in Chrome. Read the page to see what changed.`,
        isError: false,
      };
    case 'device_browser_type':
      return { content: `Typed into ${String(input['selector'])} in Chrome.`, isError: false };
    case 'device_browser_download':
      return {
        content: `Chrome started downloading ${String(input['url'])} into the user's downloads folder.`,
        isError: false,
      };
    case 'device_browser_console':
      return { content: cap(browserRecordsText(value, 'console')), isError: false };
    case 'device_browser_network':
      return { content: cap(browserRecordsText(value, 'network')), isError: false };
  }
}

async function runStep(tool: ActionStepTool, input: Record<string, unknown>): Promise<string> {
  const command = deviceStepCommand(tool);
  switch (tool) {
    case 'device_move': {
      const moved = await invokeDeviceCommand<unknown>(command, { x: input['x'], y: input['y'] });
      return `Moved the pointer to ${String(input['x'])}, ${String(input['y'])}.${frontNote(frontOf(moved))}`;
    }
    case 'device_click': {
      const clicked = await invokeDeviceCommand<unknown>(command, {
        x: input['x'],
        y: input['y'],
        button: input['button'],
        count: input['count'],
        ...reviewOf(input),
      });
      return `Clicked at ${String(input['x'])}, ${String(input['y'])}.${frontNote(frontOf(clicked))} Take a screenshot to see what changed.`;
    }
    case 'device_drag': {
      const dragged = await invokeDeviceCommand<unknown>(command, {
        x: input['x'],
        y: input['y'],
        toX: input['toX'],
        toY: input['toY'],
        ...reviewOf(input),
      });
      return `Dragged to ${String(input['toX'])}, ${String(input['toY'])}.${frontNote(frontOf(dragged))} Take a screenshot to see what changed.`;
    }
    case 'device_scroll': {
      const scrolled = await invokeDeviceCommand<unknown>(command, {
        x: input['x'],
        y: input['y'],
        deltaX: input['deltaX'],
        deltaY: input['deltaY'],
      });
      return `Scrolled.${frontNote(frontOf(scrolled))} Take a screenshot to see what is on screen now.`;
    }
    case 'device_type': {
      const typed = await invokeDeviceCommand<unknown>(command, {
        text: input['text'],
        ...reviewOf(input),
      });
      return `Typed the text into whatever had keyboard focus.${frontNote(frontOf(typed))} Take a screenshot to check it landed where you meant.`;
    }
    case 'device_key': {
      const pressed = await invokeDeviceCommand<unknown>(command, {
        key: input['key'],
        modifiers: input['modifiers'],
        ...reviewOf(input),
      });
      return `Pressed the key.${frontNote(frontOf(pressed))} Take a screenshot to see what changed.`;
    }
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
    case 'device_edit_file': {
      const edit = await invokeDeviceCommand<FileTextEdit>(command, {
        rootId: input['rootId'],
        path: input['path'],
        oldText: input['oldText'],
        newText: input['newText'],
        replaceAll: input['replaceAll'] === true,
      });
      return `Edited ${edit.path}: replaced ${edit.replacements} ${edit.replacements === 1 ? 'passage' : 'passages'}, ${edit.sizeBytes} bytes now.`;
    }
    case 'device_find_files': {
      const found = await invokeDeviceCommand<FileEntry[]>(command, {
        rootId: input['rootId'],
        pattern: input['pattern'],
        ...(typeof input['path'] === 'string' ? { path: input['path'] } : {}),
      });
      return found.length === 0 ? '(no file matches)' : describeEntries(found);
    }
    case 'device_search_text': {
      const matches = await invokeDeviceCommand<FileSearchMatch[]>(command, {
        rootId: input['rootId'],
        query: input['query'],
        ignoreCase: input['ignoreCase'] === true,
        ...(typeof input['path'] === 'string' ? { path: input['path'] } : {}),
      });
      return describeMatches(matches);
    }
    case 'device_run_command': {
      const result = await invokeDeviceCommand<ShellRunResult>(command, {
        runId: crypto.randomUUID(),
        rootId: input['rootId'],
        command: input['command'],
        ...(typeof input['path'] === 'string' ? { path: input['path'] } : {}),
        ...reviewOf(input),
      });
      return describeCommandRun(result);
    }
    case 'device_start_command': {
      const result = await invokeDeviceCommand<BackgroundShellOutput>(command, {
        runId: crypto.randomUUID(),
        rootId: input['rootId'],
        command: input['command'],
        ...(typeof input['path'] === 'string' ? { path: input['path'] } : {}),
        ...reviewOf(input),
      });
      return describeBackgroundOutput(result);
    }
    case 'device_command_output': {
      const result = await invokeDeviceCommand<BackgroundShellOutput>(command, {
        rootId: input['rootId'],
        runId: input['runId'],
        ...(typeof input['input'] === 'string' ? { input: input['input'] } : {}),
      });
      return describeBackgroundOutput(result);
    }
    case 'device_command_stop': {
      const result = await invokeDeviceCommand<BackgroundShellOutput>(command, {
        rootId: input['rootId'],
        runId: input['runId'],
      });
      return describeBackgroundOutput(result);
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
  if (!isDeviceStepTool(tool) || isPhoneStepTool(tool)) {
    return { content: `"${tool}" is not a step this device runs.`, isError: true };
  }
  if (isScreenDeviceStep(tool)) noteComputerUseConversation();
  try {
    if (tool === 'device_screenshot' || tool === 'device_zoom') {
      return await captureFor(tool, input);
    }
    if (isBrowserStepTool(tool)) return await runBrowserStep(tool, input);
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
