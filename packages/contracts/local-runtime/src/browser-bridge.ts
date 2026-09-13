export interface BrowserPairRequestPrompt {
  requestId: string;
  extensionId: string;
  code: string;
  expiresAtMs: number;
}

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
  pendingRequest: BrowserPairRequestPrompt | null;
}

export const BROWSER_PAIRING_COMMANDS = [
  'browser_pairing_state',
  'browser_pairing_install_host',
  'browser_pairing_uninstall_host',
  'browser_pairing_unpair',
] as const;

export type BrowserPairingCommand = (typeof BROWSER_PAIRING_COMMANDS)[number];
