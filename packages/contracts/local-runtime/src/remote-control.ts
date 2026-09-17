export const REMOTE_CONTROL_COMMANDS = [
  'remote_control_state',
  'remote_control_start',
  'remote_control_stop',
] as const;

export type RemoteControlCommand = (typeof REMOTE_CONTROL_COMMANDS)[number];

export type RemoteControlStatus = 'idle' | 'waiting' | 'connected' | 'error';

export interface RemoteControlState {
  status: RemoteControlStatus;
  pairingCode: string | null;
  qrPayload: string | null;
  expiresAt: number | null;
  phoneName: string | null;
  attachedSessions: number;
  error: string | null;
}

export interface RemoteControlStartRequest {
  code: string;
  wsUrl: string;
  pairToken: string;
  expiresAt: number;
}

export const IDLE_REMOTE_CONTROL_STATE: RemoteControlState = {
  status: 'idle',
  pairingCode: null,
  qrPayload: null,
  expiresAt: null,
  phoneName: null,
  attachedSessions: 0,
  error: null,
};

export interface DeviceRegistryProfile {
  installId: string;
  name: string;
  platform: string;
  osVersion: string;
  architecture: string;
  appVersion: string;
  capabilities: {
    browser: boolean;
    computerUse: boolean;
    localModels: boolean;
    localMcp: boolean;
    remoteControl: boolean;
  };
}

export const DEVICE_REGISTRY_PROFILE_COMMAND = 'device_registry_profile';
