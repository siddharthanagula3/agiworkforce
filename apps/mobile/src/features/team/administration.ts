import { API_URL } from '@/lib/constants';
import { api } from '@/services/api';

export type InvitableRole = 'admin' | 'member' | 'viewer';
export const INVITABLE_ROLES: readonly InvitableRole[] = ['member', 'admin', 'viewer'];

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | null;
}

export interface WorkspaceSeats {
  licensedSeats: number | null;
  seatsConsumed: number | null;
  seatsAvailable: number | null;
}

export interface WorkspaceInvitations {
  invitations: WorkspaceInvitation[];
  seats: WorkspaceSeats;
}

export type PostureState = 'ok' | 'attention' | 'off';

export interface PostureSignal {
  id: string;
  label: string;
  value: string;
  state: PostureState;
}

export interface PostureGroup {
  id: string;
  title: string;
  signals: PostureSignal[];
}

export interface PostureRecommendation {
  id: string;
  title: string;
  body: string;
  href: string;
}

export interface WorkspacePosture {
  groups: PostureGroup[];
  recommendations: PostureRecommendation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseInvitation(value: unknown): WorkspaceInvitation | null {
  if (!isRecord(value)) return null;
  const id = asText(value['id']);
  const email = asText(value['email']);
  if (!id || !email) return null;
  return {
    id,
    email,
    role: asText(value['role']) ?? 'member',
    status: asText(value['status']) ?? 'pending',
    expiresAt: asText(value['expiresAt']),
  };
}

function parseSignal(value: unknown): PostureSignal | null {
  if (!isRecord(value)) return null;
  const id = asText(value['id']);
  const label = asText(value['label']);
  if (!id || !label) return null;
  const state = value['state'];
  return {
    id,
    label,
    value: asText(value['value']) ?? '',
    state: state === 'ok' || state === 'attention' || state === 'off' ? state : 'off',
  };
}

export async function fetchWorkspaceInvitations(
  organizationId: string,
  signal?: AbortSignal,
): Promise<WorkspaceInvitations> {
  const response = await api.get<unknown>(
    `/api/settings/team/invitations?organizationId=${encodeURIComponent(organizationId)}`,
    signal ? { signal } : undefined,
  );
  const rows =
    isRecord(response) && Array.isArray(response['invitations']) ? response['invitations'] : [];
  const seats = isRecord(response) && isRecord(response['seats']) ? response['seats'] : {};
  return {
    invitations: rows
      .map(parseInvitation)
      .filter((invitation): invitation is WorkspaceInvitation => invitation !== null)
      .filter((invitation) => invitation.status === 'pending'),
    seats: {
      licensedSeats: asCount(seats['licensedSeats']),
      seatsConsumed: asCount(seats['seatsConsumed']),
      seatsAvailable: asCount(seats['seatsAvailable']),
    },
  };
}

export interface InvitationReceipt {
  email: string;
  emailSent: boolean;
  reason: string | null;
  link: string | null;
  replacedPreviousLink: boolean;
}

function invitationLink(token: unknown): string | null {
  const raw = asText(token);
  if (!raw) return null;
  const url = new URL('/invite', API_URL);
  url.hash = new URLSearchParams({ token: raw }).toString();
  return url.toString();
}

function parseInvitationReceipt(
  response: unknown,
  fallbackEmail: string,
  replacedPreviousLink: boolean,
): InvitationReceipt {
  const body = isRecord(response) ? response : {};
  const invitation = isRecord(body['invitation']) ? body['invitation'] : {};
  const delivery = isRecord(body['delivery']) ? body['delivery'] : {};
  const emailSent = delivery['emailSent'] === true;
  return {
    email: asText(invitation['email']) ?? fallbackEmail,
    emailSent,
    reason: emailSent ? null : asText(delivery['reason']),
    link: invitationLink(body['inviteToken']),
    replacedPreviousLink,
  };
}

export async function inviteWorkspaceMember(
  organizationId: string,
  email: string,
  role: InvitableRole,
): Promise<InvitationReceipt> {
  const response = await api.post<unknown>('/api/settings/team/invitations', {
    organizationId,
    email,
    role,
  });
  return parseInvitationReceipt(response, email, false);
}

export async function resendWorkspaceInvitation(
  organizationId: string,
  invitationId: string,
  email: string,
): Promise<InvitationReceipt> {
  const response = await api.post<unknown>(
    `/api/settings/team/invitations/${encodeURIComponent(invitationId)}`,
    { organizationId, action: 'resend' },
  );
  return parseInvitationReceipt(response, email, true);
}

export async function revokeWorkspaceInvitation(
  organizationId: string,
  invitationId: string,
): Promise<void> {
  await api.delete(
    `/api/settings/team/invitations/${encodeURIComponent(invitationId)}?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export async function fetchWorkspacePosture(signal?: AbortSignal): Promise<WorkspacePosture> {
  const response = await api.get<unknown>(
    '/api/settings/organization/posture',
    signal ? { signal } : undefined,
  );
  const posture = isRecord(response) && isRecord(response['posture']) ? response['posture'] : {};
  const groups = Array.isArray(posture['groups']) ? posture['groups'] : [];
  const recommendations = Array.isArray(posture['recommendations'])
    ? posture['recommendations']
    : [];
  return {
    groups: groups.flatMap((group): PostureGroup[] => {
      if (!isRecord(group)) return [];
      const id = asText(group['id']);
      const title = asText(group['title']);
      if (!id || !title) return [];
      const signals = Array.isArray(group['signals']) ? group['signals'] : [];
      return [
        {
          id,
          title,
          signals: signals
            .map(parseSignal)
            .filter((entry): entry is PostureSignal => entry !== null),
        },
      ];
    }),
    recommendations: recommendations.flatMap((entry): PostureRecommendation[] => {
      if (!isRecord(entry)) return [];
      const id = asText(entry['id']);
      const title = asText(entry['title']);
      const href = asText(entry['href']);
      if (!id || !title || !href) return [];
      return [{ id, title, body: asText(entry['body']) ?? '', href }];
    }),
  };
}
