import { command } from '@agiworkforce/client-runtime';

export interface ExtensionStatusDiagnostics {
  status?: string;
  version?: string;
  timestamp?: string;
  extension_support?: boolean;
  transport?: {
    native_messaging?: boolean;
    websocket_port?: number;
  };
  diagnostics?: {
    recommendations?: string[];
    realtime_token?: {
      path?: string;
      exists?: boolean;
      valid?: boolean;
      error?: string | null;
    };
    native_connection?: {
      state?: string;
      extension_id?: string | null;
      ready?: boolean;
    };
    vscode_connection?: {
      state?: string;
      ready?: boolean;
    };
  };
  commands?: string[];
}

export async function extensionStatus(): Promise<ExtensionStatusDiagnostics> {
  return command<ExtensionStatusDiagnostics>('extension_status');
}
