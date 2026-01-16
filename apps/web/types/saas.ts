export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  joined_at: string;
  profile?: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string; // Only used internally or never sent to client full
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id?: string;
  user_id?: string;
  action: string;
  resource: string;
  resource_id?: string;
  metadata: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  actor_email?: string; // Often joined
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message?: string;
  type: NotificationType;
  link?: string;
  is_read: boolean;
  created_at: string;
}
