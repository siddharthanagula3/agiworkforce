import type { AppServerCapabilities } from './AppServerCapabilities';
import type { AppServerClientInfo } from './AppServerClientInfo';

export type InitializeResponse = {
  serverInfo: AppServerClientInfo;
  protocolVersion: number;
  capabilities: AppServerCapabilities;
};
