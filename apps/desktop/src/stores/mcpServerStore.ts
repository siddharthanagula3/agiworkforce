import { invoke } from '@/lib/tauri-mock';
import { create } from 'zustand';

interface McpServerConfig {
  port: number;
  token: string;
  enabled_tools: string[];
  running: boolean;
}

interface McpServerStore {
  config: McpServerConfig | null;
  loading: boolean;
  fetchConfig: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  updateConfig: (port?: number, enabledTools?: string[]) => Promise<void>;
}

export const useMcpServerStore = create<McpServerStore>((set, get) => ({
  config: null,
  loading: false,

  fetchConfig: async () => {
    set({ loading: true });
    try {
      const config = await invoke<McpServerConfig>('mcp_server_get_config');
      set({ config });
    } finally {
      set({ loading: false });
    }
  },

  startServer: async () => {
    await invoke('mcp_server_start');
    await get().fetchConfig();
  },

  stopServer: async () => {
    await invoke('mcp_server_stop');
    await get().fetchConfig();
  },

  updateConfig: async (port?: number, enabledTools?: string[]) => {
    await invoke('mcp_server_update_config', {
      port: port ?? null,
      enabledTools: enabledTools ?? null,
    });
    await get().fetchConfig();
  },
}));
