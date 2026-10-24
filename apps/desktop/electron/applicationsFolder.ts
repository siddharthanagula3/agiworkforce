import { readFileSync, writeFileSync } from 'node:fs';
import { PRODUCT_NAMES } from '@agiworkforce/types';

/**
 * Auto-update replaces the app where it was installed, and macOS refuses that
 * for a copy running from Downloads or a disk image. The first packaged launch
 * from outside Applications offers the move once; a "Not now" is remembered so
 * the offer is never repeated.
 */

export const MOVE_TO_APPLICATIONS = {
  message: `Move ${PRODUCT_NAMES.desktop} to Applications?`,
  detail: 'It keeps itself up to date from there.',
  move: 'Move to Applications',
  decline: 'Not now',
} as const;

export interface ApplicationsFolderHost {
  readonly platform: NodeJS.Platform;
  isPackaged(): boolean;
  isInApplicationsFolder(): boolean;
  moveToApplicationsFolder(): boolean;
}

export interface ApplicationsFolderStore {
  asked(): boolean;
  markAsked(): void;
}

export function applicationsFolderStore(file: string): ApplicationsFolderStore {
  return {
    asked() {
      try {
        const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          (parsed as Record<string, unknown>)['asked'] === true
        );
      } catch {
        return false;
      }
    },
    markAsked() {
      try {
        writeFileSync(file, `${JSON.stringify({ asked: true })}\n`, 'utf8');
      } catch (error) {
        console.warn('[applications-folder] could not remember the answer:', error);
      }
    },
  };
}

export function shouldOfferMove(
  host: ApplicationsFolderHost,
  store: ApplicationsFolderStore,
): boolean {
  return (
    host.platform === 'darwin' &&
    host.isPackaged() &&
    !host.isInApplicationsFolder() &&
    !store.asked()
  );
}

/**
 * Asks, then moves. The question is recorded as answered before the move is
 * attempted: a successful move relaunches the app, and one that fails or is
 * cancelled at the system's own prompt is not worth asking about again.
 */
export async function offerMoveToApplications(
  host: ApplicationsFolderHost,
  store: ApplicationsFolderStore,
  ask: (prompt: typeof MOVE_TO_APPLICATIONS) => Promise<boolean>,
): Promise<'moved' | 'declined' | 'not-offered' | 'failed'> {
  if (!shouldOfferMove(host, store)) return 'not-offered';
  store.markAsked();
  if (!(await ask(MOVE_TO_APPLICATIONS))) return 'declined';
  try {
    return host.moveToApplicationsFolder() ? 'moved' : 'failed';
  } catch (error) {
    console.warn('[applications-folder] the move failed:', error);
    return 'failed';
  }
}
