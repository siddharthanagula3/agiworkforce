import { invoke } from '@tauri-apps/api/core';
import { isTauri, isTest } from './detect';
import { DesktopRequiredError, createDesktopPreferredWarning } from './errors';
import type { DesktopPreferredWarning } from './errors';
import { resolveCommandCapability } from './registry';
import { routeToCloud } from './http';

export interface CommandResult<T> {
  data: T;
  warning?: DesktopPreferredWarning;
}

export async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<T>(name, args);
  }

  if (isTest) {
    throw new Error(
      `command("${name}") called in test environment without mock. ` +
        `Use vi.mock('@agiworkforce/runtime') to provide a mock.`,
    );
  }

  const cap = resolveCommandCapability(name);

  if (cap.tier === 'cloud') {
    return routeToCloud<T>(name, args, cap);
  }

  if (cap.tier === 'desktop-preferred') {
    return routeToCloud<T>(name, args, cap);
  }

  throw new DesktopRequiredError(name, cap);
}

export async function commandWithWarning<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<CommandResult<T>> {
  if (isTauri) {
    const data = await invoke<T>(name, args);
    return { data };
  }

  if (isTest) {
    throw new Error(`commandWithWarning("${name}") called in test environment without mock.`);
  }

  const cap = resolveCommandCapability(name);

  if (cap.tier === 'cloud') {
    const data = await routeToCloud<T>(name, args, cap);
    return { data };
  }

  if (cap.tier === 'desktop-preferred') {
    const data = await routeToCloud<T>(name, args, cap);
    const warning = createDesktopPreferredWarning(name, cap.featureGroup);
    return { data, warning };
  }

  throw new DesktopRequiredError(name, cap);
}
