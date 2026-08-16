
import { invoke } from '../lib/tauri-mock';

export type HttpMethod = 'Get' | 'Post' | 'Put' | 'Patch' | 'Delete' | 'Head' | 'Options';

export type AuthType =
  | { type: 'None' }
  | { type: 'Bearer'; token: string }
  | { type: 'ApiKey'; key: string; header: string }
  | { type: 'Basic'; username: string; password: string }
  | { type: 'OAuth2'; token: string };

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body?: string;
  auth: AuthType;
  timeoutMs?: number;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  success: boolean;
}

export interface OAuth2Config {
  clientId: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  usePkce: boolean;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
}

export interface TemplateVariable {
  name: string;
  value: string;
  default?: string;
}

export interface RequestTemplate {
  name: string;
  description?: string;
  method: string;
  urlTemplate: string;
  headersTemplate: Record<string, string>;
  bodyTemplate?: string;
  variables: TemplateVariable[];
}

export interface ParsedResponse {
  format: string;
  data: unknown;
  raw: string;
}

export interface RenderedTemplate {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export async function apiRequest(request: ApiRequest): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_request', { request });
  } catch (error) {
    throw new Error(`API request failed: ${error}`);
  }
}

export async function apiGet(url: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_get', { url });
  } catch (error) {
    throw new Error(`GET request failed: ${error}`);
  }
}

export async function apiPostJson(url: string, body: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_post_json', { url, body });
  } catch (error) {
    throw new Error(`POST request failed: ${error}`);
  }
}

export async function apiPutJson(url: string, body: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_put_json', { url, body });
  } catch (error) {
    throw new Error(`PUT request failed: ${error}`);
  }
}

export async function apiDelete(url: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_delete', { url });
  } catch (error) {
    throw new Error(`DELETE request failed: ${error}`);
  }
}

export async function apiParseResponse(
  body: string,
  contentType?: string,
): Promise<ParsedResponse> {
  try {
    return await invoke<ParsedResponse>('api_parse_response', { body, contentType });
  } catch (error) {
    throw new Error(`Response parsing failed: ${error}`);
  }
}

export async function apiExtractJsonPath(body: string, path: string): Promise<unknown> {
  try {
    return await invoke<unknown>('api_extract_json_path', { body, path });
  } catch (error) {
    throw new Error(`JSON path extraction failed: ${error}`);
  }
}

export async function apiOAuthCreateClient(clientId: string, config: OAuth2Config): Promise<void> {
  try {
    await invoke('api_oauth_create_client', { clientId, config });
  } catch (error) {
    throw new Error(`Failed to create OAuth client: ${error}`);
  }
}

export async function apiOAuthGetAuthUrl(
  clientId: string,
  stateParam: string,
  usePkce: boolean,
): Promise<string> {
  try {
    return await invoke<string>('api_oauth_get_auth_url', { clientId, stateParam, usePkce });
  } catch (error) {
    throw new Error(`Failed to get OAuth auth URL: ${error}`);
  }
}

export async function apiOAuthExchangeCode(clientId: string, code: string): Promise<TokenResponse> {
  try {
    return await invoke<TokenResponse>('api_oauth_exchange_code', { clientId, code });
  } catch (error) {
    throw new Error(`Failed to exchange OAuth code: ${error}`);
  }
}

export async function apiOAuthRefreshToken(
  clientId: string,
  refreshToken: string,
): Promise<TokenResponse> {
  try {
    return await invoke<TokenResponse>('api_oauth_refresh_token', { clientId, refreshToken });
  } catch (error) {
    throw new Error(`Failed to refresh OAuth token: ${error}`);
  }
}

export async function apiOAuthClientCredentials(clientId: string): Promise<TokenResponse> {
  try {
    return await invoke<TokenResponse>('api_oauth_client_credentials', { clientId });
  } catch (error) {
    throw new Error(`Client credentials flow failed: ${error}`);
  }
}

export async function apiRenderTemplate(
  template: RequestTemplate,
  variables: Record<string, string>,
): Promise<RenderedTemplate> {
  try {
    return await invoke<RenderedTemplate>('api_render_template', { template, variables });
  } catch (error) {
    throw new Error(`Template rendering failed: ${error}`);
  }
}

export async function apiExtractTemplateVariables(templateStr: string): Promise<string[]> {
  try {
    return await invoke<string[]>('api_extract_template_variables', { templateStr });
  } catch (error) {
    throw new Error(`Template variable extraction failed: ${error}`);
  }
}

export async function apiValidateTemplate(templateStr: string): Promise<void> {
  try {
    await invoke('api_validate_template', { templateStr });
  } catch (error) {
    throw new Error(`Template validation failed: ${error}`);
  }
}
