import { apiClient } from './api';

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    desktopId?: string;
  };
}

export interface Credentials {
  email: string;
  password: string;
}

export const authService = {
  register(credentials: Credentials) {
    return apiClient.post<AuthResponse, Credentials>('/api/auth/register', credentials);
  },
  login(credentials: Credentials) {
    return apiClient.post<AuthResponse, Credentials>('/api/auth/login', credentials);
  },
  verify(token: string) {
    return apiClient.get<{ valid: boolean; userId: string; email: string }>('/api/auth/verify', token);
  },
};
