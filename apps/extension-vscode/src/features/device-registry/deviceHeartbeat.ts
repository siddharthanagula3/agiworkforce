import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type * as vscode from 'vscode';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DEVICE_HEARTBEAT_PATH,
  DeviceHeartbeatRequestSchema,
  deviceArchitecture,
  deviceOperatingSystem,
  type DeviceHeartbeatRequest,
} from '@agiworkforce/cloud-contracts';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { getExtensionUserAgent, getExtensionVersion } from '../../platform/version';

const INSTALL_ID_KEY = 'agiWorkforce.deviceRegistry.installId';

export interface VscodeHostFacts {
  installId: string;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  extensionVersion: string;
}

export function buildVscodeHeartbeat(facts: VscodeHostFacts): DeviceHeartbeatRequest | null {
  const candidate = {
    surface: 'vscode',
    installId: facts.installId,
    ...(facts.hostname.trim() ? { name: facts.hostname.trim().slice(0, 120) } : {}),
    os: deviceOperatingSystem(facts.platform),
    ...(facts.release ? { osVersion: facts.release.slice(0, 64) } : {}),
    architecture: deviceArchitecture(facts.arch),
    appVersion: facts.extensionVersion.slice(0, 64),
    capabilities: {
      browser: false,
      computerUse: false,
      localModels: false,
      localMcp: false,
      remoteControl: false,
    },
  };
  const parsed = DeviceHeartbeatRequestSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

async function installId(context: vscode.ExtensionContext): Promise<string> {
  const stored = context.globalState.get<string>(INSTALL_ID_KEY);
  if (stored) return stored;
  const created = randomUUID();
  await context.globalState.update(INSTALL_ID_KEY, created);
  return created;
}

export async function sendVscodeHeartbeat(
  context: vscode.ExtensionContext,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const token = await getAccountToken(context.secrets);
  if (!token) return false;
  const heartbeat = buildVscodeHeartbeat({
    installId: await installId(context),
    hostname: os.hostname().replace(/\.local$/i, ''),
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    extensionVersion: getExtensionVersion(),
  });
  if (!heartbeat) return false;
  const response = await fetchImpl(`${getCloudWebOrigin()}${DEVICE_HEARTBEAT_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': getExtensionUserAgent(),
    },
    body: JSON.stringify(heartbeat),
  });
  return response.ok;
}

export function startVscodeHeartbeat(context: vscode.ExtensionContext): vscode.Disposable {
  const beat = () => void sendVscodeHeartbeat(context).catch(() => false);
  beat();
  const timer = setInterval(beat, DEVICE_HEARTBEAT_INTERVAL_MS);
  return { dispose: () => clearInterval(timer) };
}
