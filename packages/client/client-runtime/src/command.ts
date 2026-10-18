import { isTauri, isTest } from './detect';
import { desktopRuntimeHandles, invokeDesktopRuntime } from './electronRuntime';
import { DesktopRequiredError } from './errors';
import { resolveCommandCapability } from './registry';

/**
 * Execute a desktop host command.
 *
 * In Tauri: calls invoke() directly. In the Electron shell: commands the local
 * runtime owns go over its bridge. Everywhere else the command has no host, so
 * it fails with DesktopRequiredError. In test mode it throws so the caller mocks it.
 *
 * @param name - The snake_case command name (e.g., 'chat_send_message')
 * @param args - Optional camelCase parameters (auto-converted by Tauri IPC)
 * @returns The typed command result
 */
export async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(name, args);
  }

  if (desktopRuntimeHandles(name)) {
    return invokeDesktopRuntime<T>(name, args);
  }

  if (isTest) {
    throw new Error(
      `command("${name}") called in test environment without mock. ` +
        `Use vi.mock('@agiworkforce/client-runtime') to provide a mock.`,
    );
  }

  throw new DesktopRequiredError(name, resolveCommandCapability(name));
}
