import { getCsrfToken } from '@/lib/client/csrf';

export type ContentReportStatus = 'received' | 'in_review' | 'actioned' | 'dismissed';

export interface AdminContentReport {
  id: string;
  clientReportId: string;
  userId: string | null;
  messageId: string;
  conversationId: string;
  category: string;
  contentExcerpt: string;
  userNote: string;
  status: ContentReportStatus;
  reviewerId: string | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  dueAt: string;
  overdue: boolean;
}

export interface AdminContentReportCounts {
  received: number;
  in_review: number;
  actioned: number;
  dismissed: number;
  oldestOpenAt: string | null;
  overdue: number;
  slaHours: number;
}

export interface AdminContentReportQueue {
  reports: AdminContentReport[];
  counts: AdminContentReportCounts;
}

async function responseError(response: Response): Promise<Error> {
  let message = `Content report request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: string | { message?: string } };
    if (typeof body.error === 'string' && body.error.trim()) message = body.error;
    if (body.error && typeof body.error === 'object' && body.error.message?.trim()) {
      message = body.error.message;
    }
  } catch {
    // Preserve the status-only message when the server returned no JSON body.
  }
  return new Error(message);
}

export async function fetchContentReportQueue(
  token: string,
  statuses: readonly ContentReportStatus[],
): Promise<AdminContentReportQueue> {
  if (!token.trim()) throw new Error('Admin session token is unavailable');
  const query = statuses.length ? `?status=${encodeURIComponent(statuses.join(','))}` : '';
  const response = await fetch(`/api/admin/content-reports${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<AdminContentReportQueue>;
}

export async function reviewContentReport(
  token: string,
  reportId: string,
  status: ContentReportStatus,
  reviewerNote: string,
): Promise<AdminContentReport> {
  if (!token.trim()) throw new Error('Admin session token is unavailable');
  const csrfToken = await getCsrfToken();
  const response = await fetch('/api/admin/content-reports', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ reportId, status, reviewerNote }),
  });
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as { report: AdminContentReport };
  return body.report;
}
