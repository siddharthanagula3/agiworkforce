import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authService, type AuthResponse, type Credentials } from '../services/auth';

const TOKEN_KEY = 'agiworkforce.mobile.token';

interface AuthState {
  token: string | null;
  user: AuthResponse['user'] | null;
  deviceId: string | null;
  status: 'idle' | 'pending' | 'authenticated' | 'error';
  error?: string;
  login: (credentials: Credentials) => Promise<void>;
  register: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  setDeviceId: (deviceId: string | null) => void;
}

async function persistToken(token: string | null) {
  if (!token) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  deviceId: null,
  status: 'idle',
  async login(credentials) {
    set({ status: 'pending', error: undefined });
    try {
      const response = await authService.login(credentials);
      await persistToken(response.token);
      set({
        token: response.token,
        user: response.user,
        status: 'authenticated',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to login';
      set({ status: 'error', error: message });
      throw error;
    }
  },
  async register(credentials) {
    set({ status: 'pending', error: undefined });
    try {
      const response = await authService.register(credentials);
      await persistToken(response.token);
      set({
        token: response.token,
        user: response.user,
        status: 'authenticated',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register';
      set({ status: 'error', error: message });
      throw error;
    }
  },
  async logout() {
    await persistToken(null);
    set({
      token: null,
      user: null,
      deviceId: null,
      status: 'idle',
      error: undefined,
    });
  },
  async hydrate() {
    if (get().status !== 'idle') {
      return;
    }
    const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!storedToken) {
      return;
    }
    try {
      const result = await authService.verify(storedToken);
      if (result.valid) {
        set({
          token: storedToken,
          user: {
            id: result.userId,
            email: result.email,
          },
          status: 'authenticated',
        });
      }
    } catch {
      await persistToken(null);
    }
  },
  setDeviceId(deviceId) {
    set({ deviceId });
  },
}));
