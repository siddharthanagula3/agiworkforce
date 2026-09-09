import {
  DesktopRuntimeError,
  FILESYSTEM_COMMANDS,
  WORKSPACE_COMMANDS,
  type DesktopRuntimeResponse,
} from '@agiworkforce/local-runtime-contract';

/**
 * Transport from the renderer to the privileged Electron local runtime.
 *
 * The bridge is injected by the preload as `window.agiHost`, so this module
 * never imports Electron and stays safe to evaluate during server rendering.
 * `command()` consults `desktopRuntimeHandles` before dispatching; anything the
 * local runtime does not own keeps its existing cloud route.
 */

interface RuntimeCapableHost {
  invokeRuntime?: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<DesktopRuntimeResponse<unknown>>;
}

const LOCAL_RUNTIME_COMMANDS = new Set<string>([...WORKSPACE_COMMANDS, ...FILESYSTEM_COMMANDS]);

function host(): RuntimeCapableHost | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { agiHost?: RuntimeCapableHost }).agiHost;
}

export const isElectronDesktop: boolean =
  typeof window !== 'undefined' &&
  typeof (window as { agiHost?: RuntimeCapableHost }).agiHost?.invokeRuntime === 'function';

export function desktopRuntimeHandles(command: string): boolean {
  return isElectronDesktop && LOCAL_RUNTIME_COMMANDS.has(command);
}

/**
 * Unwraps the runtime's result envelope.
 *
 * A refusal arrives as a value rather than a rejection so the reason survives
 * the IPC boundary intact; it is rethrown here as `DesktopRuntimeError`, which
 * carries the capability a caller needs in order to raise the right prompt.
 */
export async function invokeDesktopRuntime<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const bridge = host();
  if (!bridge?.invokeRuntime) {
    throw new Error(`The desktop runtime is not available for "${command}".`);
  }

  const response = await bridge.invokeRuntime(command, args);
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new Error(`The desktop runtime returned an unreadable response for "${command}".`);
  }
  if (!response.ok) throw new DesktopRuntimeError(response.error);
  return response.value as T;
}
