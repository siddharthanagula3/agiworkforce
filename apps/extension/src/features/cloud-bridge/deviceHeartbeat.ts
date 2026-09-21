import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DEVICE_HEARTBEAT_PATH,
  DeviceHeartbeatRequestSchema,
  deviceArchitecture,
  deviceOperatingSystem,
  type DeviceHeartbeatRequest,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY, getAuthToken } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

const INSTALL_ID_KEY = 'agi_device_install_id';

let lastSentAt = 0;
let inFlight: Promise<boolean> | null = null;

export interface ChromeHostFacts {
  installId: string;
  os: string;
  arch: string;
  extensionVersion: string;
  browserVersion: string | null;
}

export function buildChromeHeartbeat(facts: ChromeHostFacts): DeviceHeartbeatRequest | null {
  const candidate = {
    surface: 'chrome',
    installId: facts.installId,
    os: deviceOperatingSystem(facts.os),
    ...(facts.browserVersion ? { osVersion: facts.browserVersion.slice(0, 64) } : {}),
    architecture: deviceArchitecture(facts.arch),
    appVersion: facts.extensionVersion.slice(0, 64),
    capabilities: {
      browser: true,
      computerUse: false,
      localModels: false,
      localMcp: false,
      remoteControl: false,
    },
  };
  const parsed = DeviceHeartbeatRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** The id this install is known by, shared with every report that names a device. */
export async function deviceInstallId(): Promise<string> {
  const stored = await chrome.storage.local.get([INSTALL_ID_KEY]);
  const existing = stored[INSTALL_ID_KEY];
  if (typeof existing === 'string' && existing.length > 0) return existing;
  const created = crypto.randomUUID();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: created });
  return created;
}

async function sendHeartbeat(fetchImpl: typeof fetch): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;
  const platform = await chrome.runtime.getPlatformInfo();
  const browserVersion = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? null;
  const heartbeat = buildChromeHeartbeat({
    installId: await deviceInstallId(),
    os: platform.os,
    arch: platform.arch,
    extensionVersion: chrome.runtime.getManifest().version,
    browserVersion,
  });
  if (!heartbeat) return false;
  const response = await fetchImpl(`${FREE_TRIAL_GATEWAY}${DEVICE_HEARTBEAT_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    body: JSON.stringify(heartbeat),
  });
  if (response.ok) lastSentAt = Date.now();
  return response.ok;
}

export function sendChromeHeartbeatIfDue(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (inFlight) return inFlight;
  if (Date.now() - lastSentAt < DEVICE_HEARTBEAT_INTERVAL_MS) return Promise.resolve(false);
  inFlight = sendHeartbeat(fetchImpl)
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function resetChromeHeartbeatForTests(): void {
  lastSentAt = 0;
  inFlight = null;
}
