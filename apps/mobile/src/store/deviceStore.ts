import { create } from 'zustand';
import { deviceService, type DesktopSummary, type CommandPayload } from '../services/devices';
import { useAuthStore } from './authStore';

interface DeviceState {
  devices: DesktopSummary[];
  selectedDeviceId: string | null;
  loading: boolean;
  error?: string;
  fetchDevices: () => Promise<void>;
  selectDevice: (id: string) => void;
  sendQuickAction: (payload: CommandPayload) => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  selectedDeviceId: null,
  loading: false,
  async fetchDevices() {
    const token = useAuthStore.getState().token;
    if (!token) {
      return;
    }
    set({ loading: true, error: undefined });
    try {
      const response = await deviceService.list(token);
      set((state) => ({
        devices: response.desktops,
        selectedDeviceId:
          state.selectedDeviceId && response.desktops.some((d) => d.id === state.selectedDeviceId)
            ? state.selectedDeviceId
            : response.desktops[0]?.id ?? null,
        loading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load devices';
      set({ loading: false, error: message });
    }
  },
  selectDevice(id) {
    set({ selectedDeviceId: id });
  },
  async sendQuickAction(payload) {
    const token = useAuthStore.getState().token;
    const desktopId = get().selectedDeviceId;
    if (!token || !desktopId) {
      throw new Error('No desktop selected');
    }
    await deviceService.sendCommand(token, desktopId, payload);
  },
}));
