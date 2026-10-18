import { invoke } from '@tauri-apps/api/core';
import { isTauri, isTest } from './detect';
import { DesktopRequiredError } from './errors';
import { resolveCommandCapability } from './registry';

export async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return invoke<T>(name, args);
  }

  if (isTest) {
    throw new Error(
      `command("${name}") called in test environment without mock. ` +
        `Use vi.mock('@agiworkforce/client-runtime') to provide a mock.`,
    );
  }

  throw new DesktopRequiredError(name, resolveCommandCapability(name));
}
