/**
 * API integration layer for AGI
 * Centralized API client with authentication, error handling, and type safety
 */

import { APIResponse, APIException } from '@shared/stores/query-client';
import {
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
  readStoredToken,
  writeStoredToken,
} from './token-storage';
import { getCsrfToken } from '@/lib/client/csrf';

export interface APIConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  retryDelay: number;
  defaultHeaders: Record<string, string>;
}

const DEFAULT_CONFIG: APIConfig = {
  baseURL:
    process.env.NODE_ENV === 'development'
      ? process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api'
      : (process.env['NEXT_PUBLIC_API_URL'] ??
        (() => {
          throw new Error('NEXT_PUBLIC_API_URL not configured');
        })()),
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
  defaultHeaders: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

export class APIClient {
  private config: APIConfig;
  private tokenKey = 'auth_token';
  private refreshTokenKey = 'refresh_token';
  private cachedToken: string | null = null;
  private cachedRefreshToken: string | null = null;
  private readyPromise: Promise<void>;

  constructor(config: Partial<APIConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.readyPromise = this.loadTokenFromStorage();
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  async loadTokenFromStorage(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.cachedToken = await readStoredToken(this.tokenKey, ACCESS_TOKEN_MAX_AGE_MS);
    this.cachedRefreshToken = await readStoredToken(this.refreshTokenKey, REFRESH_TOKEN_MAX_AGE_MS);
  }

  private getToken(): string | null {
    return this.cachedToken;
  }

  private async setToken(token: string): Promise<void> {
    if (typeof window === 'undefined') return;
    this.cachedToken = token;
    try {
      await writeStoredToken(this.tokenKey, token);
    } catch {
      console.warn('[APIClient] Encryption unavailable; token stored in memory only');
    }
    getCsrfToken()
      .then((csrfToken) =>
        fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ token }),
        }),
      )
      .catch(() => {
        /* non-critical */
      });
  }

  private getRefreshToken(): string | null {
    return this.cachedRefreshToken;
  }

  private async setRefreshToken(token: string): Promise<void> {
    if (typeof window === 'undefined') return;
    this.cachedRefreshToken = token;
    try {
      await writeStoredToken(this.refreshTokenKey, token);
    } catch {
      console.warn('[APIClient] Encryption unavailable; refresh token stored in memory only');
    }
    getCsrfToken()
      .then((csrfToken) =>
        fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify({ refreshToken: token }),
        }),
      )
      .catch(() => {
        /* non-critical */
      });
  }

  private clearTokens(): void {
    if (typeof window === 'undefined') return;
    this.cachedToken = null;
    this.cachedRefreshToken = null;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    getCsrfToken()
      .then((csrfToken) =>
        fetch('/api/auth/clear-token', {
          method: 'POST',
          headers: { 'x-csrf-token': csrfToken },
        }),
      )
      .catch(() => {
        /* non-critical */
      });
  }

  private buildHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
    const headers: Record<string, string> = {
      ...this.config.defaultHeaders,
      ...customHeaders,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async retryRequest<_T>(
    requestFn: () => Promise<Response>,
    attempt = 1,
  ): Promise<Response> {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt >= this.config.retries) {
        throw error;
      }

      const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));

      return this.retryRequest(requestFn, attempt + 1);
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      throw new APIException({
        message: 'No refresh token available',
        code: 'NO_REFRESH_TOKEN',
        status: 401,
      });
    }

    const response = await fetch(`${this.config.baseURL}/auth/refresh`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      this.clearTokens();
      throw new APIException({
        message: 'Token refresh failed',
        code: 'REFRESH_FAILED',
        status: response.status,
      });
    }

    const data = await response.json();
    const newToken = data.data?.token || data.token;

    if (!newToken) {
      throw new APIException({
        message: 'Invalid refresh response',
        code: 'INVALID_REFRESH_RESPONSE',
        status: 500,
      });
    }

    await this.setToken(newToken);
    return newToken;
  }

  private async makeRequest<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<APIResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.config.baseURL}${endpoint}`;

    const requestOptions: RequestInit = {
      ...options,
      headers: this.buildHeaders(options.headers as Record<string, string>),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    requestOptions.signal = controller.signal;

    try {
      const response = await this.retryRequest(() => fetch(url, requestOptions));

      clearTimeout(timeoutId);

      if (response.status === 401 && this.getRefreshToken()) {
        try {
          await this.refreshAccessToken();
          const retryOptions = {
            ...requestOptions,
            headers: this.buildHeaders(options.headers as Record<string, string>),
          };
          const retryResponse = await fetch(url, retryOptions);
          return this.parseResponse<T>(retryResponse);
        } catch (_refreshError) {
          this.clearTokens();
          throw new APIException({
            message: 'Authentication failed',
            code: 'AUTH_FAILED',
            status: 401,
          });
        }
      }

      return this.parseResponse<T>(response);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof APIException) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new APIException({
          message: 'Request timeout',
          code: 'TIMEOUT',
          status: 408,
        });
      }

      if (error instanceof TypeError) {
        throw new APIException({
          message: 'Network error',
          code: 'NETWORK_ERROR',
          status: 0,
        });
      }

      throw new APIException({
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'UNKNOWN_ERROR',
      });
    }
  }

  private async parseResponse<T>(response: Response): Promise<APIResponse<T>> {
    const contentType = response.headers.get('content-type');

    if (response.status === 204) {
      return {
        data: null as T,
        success: true,
      };
    }

    if (!contentType?.includes('application/json')) {
      if (!response.ok) {
        throw new APIException({
          message: `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
        });
      }

      const text = await response.text();
      return {
        data: text as T,
        success: true,
      };
    }

    let data: APIResponse<T>;
    try {
      data = await response.json();
    } catch (_error) {
      throw new APIException({
        message: 'Invalid JSON response',
        code: 'INVALID_JSON',
        status: response.status,
      });
    }

    if (!response.ok) {
      throw new APIException({
        message: data.message || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,

        details: (data.errors || data) as unknown as Record<string, unknown>,
      });
    }

    return data;
  }

  async get<T = unknown>(
    endpoint: string,
    params?: Record<string, unknown>,
  ): Promise<APIResponse<T>> {
    let url = endpoint;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => searchParams.append(key, String(v)));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });

      const paramString = searchParams.toString();
      if (paramString) {
        url += `?${paramString}`;
      }
    }

    return this.makeRequest<T>(url, { method: 'GET' });
  }

  async post<T = unknown>(endpoint: string, data?: unknown): Promise<APIResponse<T>> {
    const options: RequestInit = {
      method: 'POST',
    };

    if (data) {
      if (data instanceof FormData) {
        options.body = data;
        // Don't set Content-Type header for FormData, let browser set it
      } else {
        options.body = JSON.stringify(data);
      }
    }

    return this.makeRequest<T>(endpoint, options);
  }

  async put<T = unknown>(endpoint: string, data?: unknown): Promise<APIResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T = unknown>(endpoint: string, data?: unknown): Promise<APIResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = unknown>(endpoint: string): Promise<APIResponse<T>> {
    return this.makeRequest<T>(endpoint, { method: 'DELETE' });
  }

  async upload<T = unknown>(
    endpoint: string,
    file: File,
    options: {
      fieldName?: string;
      additionalData?: Record<string, unknown>;
      onProgress?: (progress: number) => void;
    } = {},
  ): Promise<APIResponse<T>> {
    const { fieldName = 'file', additionalData = {}, onProgress } = options;

    const formData = new FormData();
    formData.append(fieldName, file);

    Object.entries(additionalData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            onProgress(progress);
          }
        });
      }

      xhr.addEventListener('load', async () => {
        try {
          const response = new Response(xhr.response, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: new Headers(
              xhr
                .getAllResponseHeaders()
                .split('\r\n')
                .filter((line) => line.trim())
                .reduce(
                  (headers, line) => {
                    const [key, value] = line.split(': ');
                    if (key && value) headers[key.toLowerCase()] = value;
                    return headers;
                  },
                  {} as Record<string, string>,
                ),
            ),
          });

          const result = await this.parseResponse<T>(response);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      xhr.addEventListener('error', () => {
        reject(
          new APIException({
            message: 'Upload failed',
            code: 'UPLOAD_FAILED',
          }),
        );
      });

      xhr.addEventListener('timeout', () => {
        reject(
          new APIException({
            message: 'Upload timeout',
            code: 'UPLOAD_TIMEOUT',
            status: 408,
          }),
        );
      });

      const url = endpoint.startsWith('http') ? endpoint : `${this.config.baseURL}${endpoint}`;

      xhr.open('POST', url);

      const token = this.getToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.timeout = this.config.timeout;
      xhr.send(formData);
    });
  }

  async login(credentials: { email: string; password: string }): Promise<
    APIResponse<{
      user: unknown;
      token: string;
      refreshToken: string;
    }>
  > {
    const response = await this.post<{
      user: unknown;
      token: string;
      refreshToken: string;
    }>('/auth/login', credentials);

    if (response.data?.token) {
      await this.setToken(response.data.token);
    }
    if (response.data?.refreshToken) {
      await this.setRefreshToken(response.data.refreshToken);
    }

    return response;
  }

  async logout(): Promise<APIResponse<void>> {
    try {
      await this.post('/auth/logout');
    } finally {
      this.clearTokens();
    }

    return {
      data: null as unknown as void,
      success: true,
    };
  }

  updateConfig(newConfig: Partial<APIConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): APIConfig {
    return { ...this.config };
  }

  async healthCheck(): Promise<APIResponse<{ status: string; timestamp: string }>> {
    return this.get('/health');
  }

  createEventSource(endpoint: string, options?: { withCredentials?: boolean }): EventSource {
    const url = endpoint.startsWith('http') ? endpoint : `${this.config.baseURL}${endpoint}`;

    const eventSource = new EventSource(url, {
      withCredentials: options?.withCredentials ?? true,
    });

    return eventSource;
  }

  /**
   * Create a secure streaming connection using fetch with ReadableStream.
   * This allows passing auth tokens in headers (unlike EventSource).
   *
   * @param endpoint - The API endpoint
   * @param onMessage - Callback for each SSE message
   * @param onError - Optional error handler
   * @returns AbortController to cancel the stream
   */
  async createSecureStream(
    endpoint: string,
    onMessage: (data: string) => void,
    onError?: (error: Error) => void,
  ): Promise<AbortController> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.config.baseURL}${endpoint}`;

    const controller = new AbortController();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders({
          Accept: 'text/event-stream',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                onMessage(data);
              }
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            onError?.(error);
          }
        }
      })();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    return controller;
  }

  /**
   * Create a secure WebSocket connection.
   *
   * SECURITY: Auth tokens are passed via the Sec-WebSocket-Protocol header
   * or sent as the first message after connection, NOT in URL query parameters.
   * This prevents credential exposure in server logs, browser history, and Referer headers.
   *
   * The WebSocket uses a two-phase authentication:
   * 1. Connect without token in URL
   * 2. Send auth message as first message after connection opens
   *
   * @param endpoint - WebSocket endpoint
   * @param protocols - Optional WebSocket sub-protocols
   * @param options - Configuration options
   * @returns Object with WebSocket and auth helper
   */
  createWebSocket(
    endpoint: string,
    protocols?: string | string[],
    options?: {
      useProtocolAuth?: boolean;
      useMessageAuth?: boolean;
    },
  ): { ws: WebSocket; sendAuth: () => void } {
    const url = endpoint.startsWith('ws')
      ? endpoint
      : `${this.config.baseURL.replace('http', 'ws')}${endpoint}`;

    const token = this.getToken();
    const { useProtocolAuth = false, useMessageAuth = true } = options ?? {};

    let wsProtocols: string | string[] | undefined = protocols;

    if (useProtocolAuth && token) {
      const authProtocol = `auth-${token}`;
      if (protocols) {
        wsProtocols = Array.isArray(protocols)
          ? [...protocols, authProtocol]
          : [protocols, authProtocol];
      } else {
        wsProtocols = authProtocol;
      }
    }

    const ws = new WebSocket(url, wsProtocols);

    const sendAuth = () => {
      if (useMessageAuth && token && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'auth',
            token: token,
            timestamp: Date.now(),
          }),
        );
      }
    };

    return { ws, sendAuth };
  }
}

export const apiClient = new APIClient();

export interface RequestInterceptor {
  (config: RequestInit): RequestInit | Promise<RequestInit>;
}

export interface ResponseInterceptor {
  <T>(response: APIResponse<T>): APIResponse<T> | Promise<APIResponse<T>>;
}

export interface ErrorInterceptor {
  (error: APIException): APIException | Promise<APIException>;
}

class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.errorInterceptors.splice(index, 1);
      }
    };
  }

  async processRequest(config: RequestInit): Promise<RequestInit> {
    let processedConfig = config;
    for (const interceptor of this.requestInterceptors) {
      processedConfig = await interceptor(processedConfig);
    }
    return processedConfig;
  }

  async processResponse<T>(response: APIResponse<T>): Promise<APIResponse<T>> {
    let processedResponse = response;
    for (const interceptor of this.responseInterceptors) {
      processedResponse = await interceptor(processedResponse);
    }
    return processedResponse;
  }

  async processError(error: APIException): Promise<APIException> {
    let processedError = error;
    for (const interceptor of this.errorInterceptors) {
      processedError = await interceptor(processedError);
    }
    return processedError;
  }
}

export const interceptors = new InterceptorManager();

export const createAPIClient = (config: Partial<APIConfig> = {}) => {
  return new APIClient(config);
};

export const buildQueryString = (params: Record<string, unknown>): string => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });

  return searchParams.toString();
};

export const isAPIError = (error: unknown, code?: string): error is APIException => {
  return error instanceof APIException && (!code || error.code === code);
};

export const getErrorMessage = (error: unknown): string => {
  if (isAPIError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
};

export default apiClient;
