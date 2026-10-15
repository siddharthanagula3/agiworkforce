import * as Crypto from 'expo-crypto';
import { getDeviceId } from '@/lib/deviceId';

const PURPOSE = 'agi-remote-control:';

/**
 * Lets a desktop recognise this phone when it reconnects to the same Remote
 * Control session. Derived from the install's own id rather than sending it,
 * so a paired desktop never holds the id push registration uses.
 */
export async function companionInstallationId(): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${PURPOSE}${await getDeviceId()}`,
  );
}
