import { isTauri } from './runtimeEnvironment';
import { isElectronBridgeCommand } from './tauri-electron/bridgeContract';

/**
 * The command every inbound phone message is verified with.
 *
 * Remote Control is only real where this exists. Without it `verifyEnvelope`
 * throws on an unknown command, falls past every named reason, and drops the
 * message, so the desktop can sit there paired and reporting Connected while
 * nothing the phone sends ever arrives.
 */
const DISPATCH_VERIFY_COMMAND = 'dispatch_hmac_verify';

/**
 * Whether this host can actually carry Remote Control.
 *
 * Asked of the bridge rather than hardcoded to a shell, so the day the dispatch
 * commands are ported this answers yes on its own instead of needing someone to
 * remember this file.
 */
export function remoteControlSupported(): boolean {
  if (isTauri) return true;
  return isElectronBridgeCommand(DISPATCH_VERIFY_COMMAND);
}

export const REMOTE_CONTROL_UNAVAILABLE =
  'Remote Control is not available in this build. Pairing a phone here would connect, and every message it sent would be discarded, so it is switched off rather than shown as working.';
