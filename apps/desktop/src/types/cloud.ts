export type CloudProvider = 'google_drive' | 'dropbox' | 'one_drive';

export interface CloudAccount {
  account_id: string;
  provider: CloudProvider;
  label?: string | null;
}

export interface CloudFile {
  id: string;
  name: string;
  path: string;
  mime_type?: string | null;
  size?: number | null;
  modified_at?: string | null;
  is_folder: boolean;
  share_link?: string | null;
}

export interface ShareLink {
  url: string;
  expires_at?: string | null;
  scope?: string | null;
  allow_edit: boolean;
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface PendingAuthorization {
  provider: CloudProvider;
  state: string;
  authUrl: string;
}
