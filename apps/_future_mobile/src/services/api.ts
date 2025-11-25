import Constants from 'expo-constants';

export interface ApiClientOptions {
  token?: string | null;
}

function getBaseUrl(): string {
  const envUrl =
    Constants.expoConfig?.extra?.['apiBaseUrl'] ??
    Constants.manifest?.extra?.['apiBaseUrl'] ??
    process.env['MOBILE_API_BASE_URL'];
  return typeof envUrl === 'string' && envUrl.length > 0 ? envUrl : 'http://localhost:3000';
}

async function request<T>(path: string, options: RequestInit, token?: string | null): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const json = await response.json();
      if (json?.error) {
        errorMessage = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get<T>(path: string, token?: string | null) {
    return request<T>(
      path,
      {
        method: 'GET',
      },
      token,
    );
  },
  post<T, B = unknown>(path: string, body: B, token?: string | null) {
    return request<T>(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      token,
    );
  },
  delete<T>(path: string, token?: string | null) {
    return request<T>(
      path,
      {
        method: 'DELETE',
      },
      token,
    );
  },
};

export type ApiClient = typeof apiClient;
