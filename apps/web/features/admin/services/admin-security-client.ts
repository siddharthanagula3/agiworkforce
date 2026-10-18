import { getCsrfToken } from '@/lib/client/csrf';
import { responseErrorMessage } from '@/shared/utils/api-error';

export type AdminSecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AdminSecurityEvent {
  id: string;
  user_id: string | null;
  event_type: string;
  severity: AdminSecuritySeverity;
  ip_address: string | null;
  endpoint: string | null;
  created_at: string;
}

export interface AdminSecurityMetrics {
  total_events_24h: number;
  total_events_7d: number;
  unique_ips_24h: number;
  unique_users_24h: number;
  critical_events_24h: number;
  high_severity_events_24h: number;
}

export interface AdminSecurityAlert {
  alert_name: string;
  triggered: boolean;
  current_count: number;
  threshold: number;
  window_minutes: number;
  severity: 'warning' | 'critical';
}

export interface AdminSecurityDashboard {
  metrics: AdminSecurityMetrics;
  alerts: AdminSecurityAlert[];
  recent_critical: AdminSecurityEvent[];
  top_ips: Array<{ ip_address: string; event_count: number }>;
}

export type AdminAccountAction = 'suspend-user' | 'ban-user' | 'reactivate-user';

async function responseError(response: Response): Promise<Error> {
  return new Error(
    await responseErrorMessage(response, `Admin security request failed (${response.status})`),
  );
}

async function fetchAdminJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export async function fetchAdminSecurityOperations(token: string): Promise<{
  dashboard: AdminSecurityDashboard;
  events: AdminSecurityEvent[];
}> {
  if (!token.trim()) throw new Error('Admin session token is unavailable');
  const [dashboard, eventResponse] = await Promise.all([
    fetchAdminJson<AdminSecurityDashboard>('/api/admin/security', token),
    fetchAdminJson<{ events: AdminSecurityEvent[] }>(
      '/api/admin/security?action=events&limit=25',
      token,
    ),
  ]);
  return { dashboard, events: eventResponse.events };
}

export async function performAdminAccountAction(
  token: string,
  action: AdminAccountAction,
  userId: string,
  reason: string,
): Promise<{ message: string; account_status: string }> {
  if (!token.trim()) throw new Error('Admin session token is unavailable');
  const csrfToken = await getCsrfToken();
  const response = await fetch(`/api/admin/security?action=${action}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ userId, reason }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ message: string; account_status: string }>;
}
