import type { JobApplicationProfile } from '../../types';

export interface PageAccess {
  readonly approved: boolean;
  readonly inPagePanel: boolean;
}

const NO_PAGE_ACCESS: PageAccess = { approved: false, inPagePanel: false };

interface WorkerReply {
  success?: unknown;
  approved?: unknown;
  inPagePanel?: unknown;
  profile?: unknown;
  error?: unknown;
}

async function askWorker(message: Record<string, unknown>): Promise<WorkerReply | null> {
  const reply: unknown = await chrome.runtime.sendMessage(message);
  return reply && typeof reply === 'object' ? (reply as WorkerReply) : null;
}

export async function requestPageAccess(): Promise<PageAccess> {
  try {
    const reply = await askWorker({ type: 'GET_PAGE_ACCESS' });
    if (reply?.success !== true || reply.approved !== true) return NO_PAGE_ACCESS;
    return { approved: true, inPagePanel: reply.inPagePanel === true };
  } catch {
    return NO_PAGE_ACCESS;
  }
}

export async function requestAutofillProfile(): Promise<JobApplicationProfile | null> {
  try {
    const reply = await askWorker({ type: 'GET_AUTOFILL_PROFILE' });
    if (reply?.success !== true) return null;
    const profile = reply.profile;
    return profile && typeof profile === 'object' && !Array.isArray(profile)
      ? (profile as JobApplicationProfile)
      : {};
  } catch {
    return null;
  }
}

export async function authorizeSiteToolDestination(url: string): Promise<void> {
  const reply = await askWorker({ type: 'AUTHORIZE_SITE_TOOL_DESTINATION', url });
  if (reply?.success !== true)
    throw new Error(
      typeof reply?.error === 'string' ? reply.error : 'The form destination is not approved.',
    );
}
