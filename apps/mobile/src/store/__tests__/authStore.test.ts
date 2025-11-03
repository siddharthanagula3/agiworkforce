
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../authStore';
import { authService } from '../../services/auth';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock('../../services/auth', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    verify: vi.fn(),
  },
}));

const mockedSecureStore = SecureStore as unknown as {
  getItemAsync: ReturnType<typeof vi.fn>;
  setItemAsync: ReturnType<typeof vi.fn>;
  deleteItemAsync: ReturnType<typeof vi.fn>;
};

const mockedAuthService = authService as {
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  useAuthStore.setState({
    token: null,
    user: null,
    deviceId: null,
    status: 'idle',
    error: undefined,
  });
  mockedSecureStore.getItemAsync.mockReset();
  mockedSecureStore.setItemAsync.mockReset();
  mockedSecureStore.deleteItemAsync.mockReset();
  mockedAuthService.login.mockReset();
  mockedAuthService.register.mockReset();
  mockedAuthService.verify.mockReset();
});

describe('authStore', () => {
  it('logs in and stores token', async () => {
    mockedAuthService.login.mockResolvedValue({
      token: 'token-123',
      user: { id: 'user-1', email: 'test@example.com' },
    });

    await useAuthStore.getState().login({ email: 'test@example.com', password: 'password123' });

    expect(useAuthStore.getState().token).toBe('token-123');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), 'token-123');
  });

  it('hydrates from secure store when token valid', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValue('token-abc');
    mockedAuthService.verify.mockResolvedValue({
      valid: true,
      userId: 'user-1',
      email: 'test@example.com',
    });

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().token).toBe('token-abc');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});
