import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { toUserMessage } from '@/lib/user-error-message';

const RESTART_FAILED = 'AGI Cloud could not restart to install the update. Try again.';
const INSTALLER_FAILED = 'The installer download could not be opened. Try again.';
const RESTART_DEFERRED = 'The update will install the next time AGI Cloud quits.';
const RESTART_NOT_READY =
  'The update has not finished downloading. Check for updates again in a few minutes.';

export interface UpdateInstallFeedback {
  kind: 'error' | 'status';
  message: string;
}

export async function installUpdate(
  host: HostBridge,
  restart: boolean,
): Promise<UpdateInstallFeedback | null> {
  try {
    if (!restart) {
      await host.openUpdateInstaller();
      return null;
    }
    const outcome = await host.restartToUpdate?.();
    if (outcome === 'deferred') return { kind: 'status', message: RESTART_DEFERRED };
    if (outcome === 'not-ready') return { kind: 'error', message: RESTART_NOT_READY };
    return null;
  } catch (cause) {
    return {
      kind: 'error',
      message: toUserMessage(cause, restart ? RESTART_FAILED : INSTALLER_FAILED),
    };
  }
}
