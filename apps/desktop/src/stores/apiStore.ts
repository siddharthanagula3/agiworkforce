import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  query_params?: Record<string, string>;
  timeout_seconds?: number;
  follow_redirects?: boolean;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  duration_ms: number;
}

export interface OAuth2Config {
  client_id: string;
  client_secret?: string;
  auth_url: string;
  token_url: string;
  redirect_uri: string;
  scopes: string[];
  use_pkce: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface RequestTemplate {
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  variables: string[];
}

export interface SavedRequest {
  id: string;
  name: string;
  request: ApiRequest;
  createdAt: number;
}

interface ApiState {
  // Current request
  currentRequest: ApiRequest;
  response: ApiResponse | null;
  loading: boolean;
  error: string | null;

  // Saved requests & templates
  savedRequests: SavedRequest[];
  templates: RequestTemplate[];

  // OAuth clients
  oauthClients: Map<string, OAuth2Config>;
  tokens: Map<string, TokenResponse>;

  // Request history
  history: ApiResponse[];

  // Actions - Request execution
  executeRequest: (request: ApiRequest) => Promise<ApiResponse>;
  get: (url: string) => Promise<ApiResponse>;
  post: (url: string, body: string) => Promise<ApiResponse>;
  put: (url: string, body: string) => Promise<ApiResponse>;
  delete: (url: string) => Promise<ApiResponse>;

  // Actions - Request management
  setCurrentRequest: (request: Partial<ApiRequest>) => void;
  saveRequest: (name: string, request: ApiRequest) => void;
  loadRequest: (id: string) => void;
  deleteRequest: (id: string) => void;

  // Actions - OAuth
  createOAuthClient: (clientId: string, config: OAuth2Config) => Promise<void>;
  getAuthUrl: (clientId: string, state: string, usePkce: boolean) => Promise<string>;
  exchangeCode: (clientId: string, code: string) => Promise<TokenResponse>;
  refreshToken: (clientId: string, refreshToken: string) => Promise<TokenResponse>;
  clientCredentials: (clientId: string) => Promise<TokenResponse>;

  // Actions - Templates
  renderTemplate: (
    template: RequestTemplate,
    variables: Record<string, string>,
  ) => Promise<ApiRequest>;
  extractVariables: (templateStr: string) => Promise<string[]>;
  validateTemplate: (templateStr: string) => Promise<boolean>;

  // Actions - Response parsing
  parseResponse: (body: string, contentType?: string) => Promise<any>;
  extractJsonPath: (body: string, path: string) => Promise<any>;

  // UI state
  clearResponse: () => void;
  clearError: () => void;
}

export const useApiStore = create<ApiState>((set, get) => ({
  // Initial state
  currentRequest: {
    method: 'GET',
    url: 'https://api.example.com',
    headers: { 'Content-Type': 'application/json' },
  },
  response: null,
  loading: false,
  error: null,
  savedRequests: [],
  templates: [],
  oauthClients: new Map(),
  tokens: new Map(),
  history: [],

  // Request execution
  executeRequest: async (request: ApiRequest) => {
    set({ loading: true, error: null });
    try {
      const response = await invoke<ApiResponse>('api_request', { request });
      set((state) => ({
        response,
        loading: false,
        history: [...state.history.slice(-99), response],
      }));
      return response;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  get: async (url: string) => {
    set({ loading: true, error: null });
    try {
      const response = await invoke<ApiResponse>('api_get', { url });
      set((state) => ({
        response,
        loading: false,
        history: [...state.history.slice(-99), response],
      }));
      return response;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  post: async (url: string, body: string) => {
    set({ loading: true, error: null });
    try {
      const response = await invoke<ApiResponse>('api_post_json', { url, body });
      set((state) => ({
        response,
        loading: false,
        history: [...state.history.slice(-99), response],
      }));
      return response;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  put: async (url: string, body: string) => {
    set({ loading: true, error: null });
    try {
      const response = await invoke<ApiResponse>('api_put_json', { url, body });
      set((state) => ({
        response,
        loading: false,
        history: [...state.history.slice(-99), response],
      }));
      return response;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  delete: async (url: string) => {
    set({ loading: true, error: null });
    try {
      const response = await invoke<ApiResponse>('api_delete', { url });
      set((state) => ({
        response,
        loading: false,
        history: [...state.history.slice(-99), response],
      }));
      return response;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  // Request management
  setCurrentRequest: (request: Partial<ApiRequest>) => {
    set((state) => ({
      currentRequest: { ...state.currentRequest, ...request },
    }));
  },

  saveRequest: (name: string, request: ApiRequest) => {
    const savedRequest: SavedRequest = {
      id: `req_${Date.now()}`,
      name,
      request,
      createdAt: Date.now(),
    };

    set((state) => ({
      savedRequests: [...state.savedRequests, savedRequest],
    }));
  },

  loadRequest: (id: string) => {
    const saved = get().savedRequests.find((r) => r.id === id);
    if (saved) {
      set({ currentRequest: saved.request });
    }
  },

  deleteRequest: (id: string) => {
    set((state) => ({
      savedRequests: state.savedRequests.filter((r) => r.id !== id),
    }));
  },

  // OAuth
  createOAuthClient: async (clientId: string, config: OAuth2Config) => {
    try {
      await invoke('api_oauth_create_client', { clientId, config });
      set((state) => {
        const newClients = new Map(state.oauthClients);
        newClients.set(clientId, config);
        return { oauthClients: newClients };
      });
    } catch (error) {
      throw error;
    }
  },

  getAuthUrl: async (clientId: string, state: string, usePkce: boolean) => {
    try {
      const url = await invoke<string>('api_oauth_get_auth_url', {
        clientId,
        stateParam: state,
        usePkce,
      });
      return url;
    } catch (error) {
      throw error;
    }
  },

  exchangeCode: async (clientId: string, code: string) => {
    try {
      const token = await invoke<TokenResponse>('api_oauth_exchange_code', {
        clientId,
        code,
      });

      set((state) => {
        const newTokens = new Map(state.tokens);
        newTokens.set(clientId, token);
        return { tokens: newTokens };
      });

      return token;
    } catch (error) {
      throw error;
    }
  },

  refreshToken: async (clientId: string, refreshToken: string) => {
    try {
      const token = await invoke<TokenResponse>('api_oauth_refresh_token', {
        clientId,
        refreshToken,
      });

      set((state) => {
        const newTokens = new Map(state.tokens);
        newTokens.set(clientId, token);
        return { tokens: newTokens };
      });

      return token;
    } catch (error) {
      throw error;
    }
  },

  clientCredentials: async (clientId: string) => {
    try {
      const token = await invoke<TokenResponse>('api_oauth_client_credentials', {
        clientId,
      });

      set((state) => {
        const newTokens = new Map(state.tokens);
        newTokens.set(clientId, token);
        return { tokens: newTokens };
      });

      return token;
    } catch (error) {
      throw error;
    }
  },

  // Templates
  renderTemplate: async (template: RequestTemplate, variables: Record<string, string>) => {
    try {
      const rendered = await invoke<any>('api_render_template', {
        template,
        variables,
      });

      return {
        method: rendered.method,
        url: rendered.url,
        headers: rendered.headers || {},
        body: rendered.body,
      } as ApiRequest;
    } catch (error) {
      throw error;
    }
  },

  extractVariables: async (templateStr: string) => {
    try {
      const variables = await invoke<string[]>('api_extract_template_variables', {
        templateStr,
      });
      return variables;
    } catch (error) {
      throw error;
    }
  },

  validateTemplate: async (templateStr: string) => {
    try {
      await invoke('api_validate_template', { templateStr });
      return true;
    } catch (error) {
      return false;
    }
  },

  // Response parsing
  parseResponse: async (body: string, contentType?: string) => {
    try {
      const parsed = await invoke<any>('api_parse_response', {
        body,
        contentType,
      });
      return parsed;
    } catch (error) {
      throw error;
    }
  },

  extractJsonPath: async (body: string, path: string) => {
    try {
      const result = await invoke<any>('api_extract_json_path', {
        body,
        path,
      });
      return result;
    } catch (error) {
      throw error;
    }
  },

  // UI state
  clearResponse: () => {
    set({ response: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));
