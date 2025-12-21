/**
 * Account related types matching backend structs
 */

export interface DeviceLinkResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}
