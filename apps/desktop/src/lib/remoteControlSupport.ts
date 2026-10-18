import { isTauri } from './runtimeEnvironment';

/**
 * Whether this host can actually carry Remote Control.
 *
 * Every inbound phone message is verified with the native `dispatch_hmac_verify`
 * command. Without it `verifyEnvelope` throws on an unknown command, falls past
 * every named reason, and drops the message, so the desktop would sit there
 * paired and reporting Connected while nothing the phone sends ever arrives.
 * Only the Tauri core registers it.
 */
export function remoteControlSupported(): boolean {
  return isTauri;
}

export const REMOTE_CONTROL_UNAVAILABLE =
  'Remote Control is not available in this build. Pairing a phone here would connect, and every message it sent would be discarded, so it is switched off rather than shown as working.';
