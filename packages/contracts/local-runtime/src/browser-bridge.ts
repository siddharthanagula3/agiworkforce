export interface BrowserPairRequestPrompt {
  requestId: string;
  extensionId: string;
  code: string;
  expiresAtMs: number;
}

/**
 * A pairing that is waiting for its code, as a page is told of it. The code
 * itself is shown only by the shell, in a dialog of its own: it is what
 * proves someone at the computer read it there and typed it into the
 * extension, which a page that could read it could do for them.
 */
export type BrowserPairRequestNotice = Omit<BrowserPairRequestPrompt, 'code'>;

export interface BrowserPairingState {
  bridgePort: number;
  bridgeListening: boolean;
  paired: boolean;
  extensionId: string | null;
  fingerprint: string | null;
  pairedAtMs: number | null;
  connected: boolean;
  hostInstalled: boolean;
  installedManifestPaths: readonly string[];
  pendingRequest: BrowserPairRequestNotice | null;
  /**
   * Why the bridge is not listening, in words for the user, when starting it
   * failed. Absent from shells that predate it.
   */
  unavailableReason?: string | null;
}

export const BROWSER_PAIRING_COMMANDS = [
  'browser_pairing_state',
  'browser_pairing_install_host',
  'browser_pairing_uninstall_host',
  'browser_pairing_unpair',
] as const;

export type BrowserPairingCommand = (typeof BROWSER_PAIRING_COMMANDS)[number];

export type BrowserActivityOutcome = 'running' | 'ok' | 'failed';

export interface BrowserActivityEntry {
  atMs: number;
  client: string;
  command: string;
  target: string | null;
  outcome: BrowserActivityOutcome;
  error: string | null;
}
