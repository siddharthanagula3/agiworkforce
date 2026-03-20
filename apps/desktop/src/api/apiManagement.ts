/**
 * API Management
 *
 * TypeScript wrappers for the generic HTTP client, OAuth 2.0 flows, and
 * request-template engine exposed by sys/commands/api.rs.
 *
 * Covered commands:
 *   api_request                  - execute a fully-specified ApiRequest
 *   api_get                      - shorthand GET
 *   api_post_json                - shorthand POST (JSON body)
 *   api_put_json                 - shorthand PUT (JSON body)
 *   api_delete                   - shorthand DELETE
 *   api_parse_response           - parse a response body into structured data
 *   api_extract_json_path        - extract a value from JSON by path
 *   api_oauth_create_client      - register an OAuth 2.0 client
 *   api_oauth_get_auth_url       - build an authorization URL (with optional PKCE)
 *   api_oauth_exchange_code      - exchange auth code for tokens
 *   api_oauth_refresh_token      - refresh an access token
 *   api_oauth_client_credentials - client-credentials grant
 *   api_render_template          - render a request template with variables
 *   api_extract_template_variables - extract variable names from a template string
 *   api_validate_template        - validate template syntax
 */

import { invoke } from '../lib/tauri-mock';

// ---------------------------------------------------------------------------
// Types (mirror Rust structs — field names are camelCase for IPC)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

/** Execute a fully-specified API request. */
export async function apiRequest(request: ApiRequest): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_request', { request });
  } catch (error) {
    throw new Error(`API request failed: ${error}`);
  }
}

/** Execute a GET request to the given URL. */
export async function apiGet(url: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_get', { url });
  } catch (error) {
    throw new Error(`GET request failed: ${error}`);
  }
}

/** Execute a POST request with a JSON body. */
export async function apiPostJson(url: string, body: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_post_json', { url, body });
  } catch (error) {
    throw new Error(`POST request failed: ${error}`);
  }
}

/** Execute a PUT request with a JSON body. */
export async function apiPutJson(url: string, body: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_put_json', { url, body });
  } catch (error) {
    throw new Error(`PUT request failed: ${error}`);
  }
}

/** Execute a DELETE request to the given URL. */
export async function apiDelete(url: string): Promise<ApiResponse> {
  try {
    return await invoke<ApiResponse>('api_delete', { url });
  } catch (error) {
    throw new Error(`DELETE request failed: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/** Parse a response body into structured data (auto-detects format). */
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

/** Extract a value from a JSON response body using a dot-separated path. */
export async function apiExtractJsonPath(
  body: string,
  path: string,
): Promise<unknown> {
  try {
    return await invoke<unknown>('api_extract_json_path', { body, path });
  } catch (error) {
    throw new Error(`JSON path extraction failed: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// OAuth 2.0
// ---------------------------------------------------------------------------

/** Register an OAuth 2.0 client for later use in auth flows. */
export async function apiOAuthCreateClient(
  clientId: string,
  config: OAuth2Config,
): Promise<void> {
  try {
    await invoke('api_oauth_create_client', { clientId, config });
  } catch (error) {
    throw new Error(`Failed to create OAuth client: ${error}`);
  }
}

/**
 * Build an authorization URL for the given OAuth client.
 * If `usePkce` is true a PKCE challenge is generated and stored server-side.
 */
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

/** Exchange an authorization code for access/refresh tokens. */
export async function apiOAuthExchangeCode(
  clientId: string,
  code: string,
): Promise<TokenResponse> {
  try {
    return await invoke<TokenResponse>('api_oauth_exchange_code', { clientId, code });
  } catch (error) {
    throw new Error(`Failed to exchange OAuth code: ${error}`);
  }
}

/** Refresh an expired access token using a refresh token. */
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

/** Obtain tokens using the client-credentials grant (machine-to-machine). */
export async function apiOAuthClientCredentials(
  clientId: string,
): Promise<TokenResponse> {
  try {
    return await invoke<TokenResponse>('api_oauth_client_credentials', { clientId });
  } catch (error) {
    throw new Error(`Client credentials flow failed: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Request Templates
// ---------------------------------------------------------------------------

/** Render a request template by substituting the provided variables. */
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

/** Extract the set of variable names referenced in a template string. */
export async function apiExtractTemplateVariables(
  templateStr: string,
): Promise<string[]> {
  try {
    return await invoke<string[]>('api_extract_template_variables', { templateStr });
  } catch (error) {
    throw new Error(`Template variable extraction failed: ${error}`);
  }
}

/** Validate that a template string has correct syntax. */
export async function apiValidateTemplate(templateStr: string): Promise<void> {
  try {
    await invoke('api_validate_template', { templateStr });
  } catch (error) {
    throw new Error(`Template validation failed: ${error}`);
  }
}
