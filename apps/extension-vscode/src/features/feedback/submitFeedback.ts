import * as vscode from 'vscode';
import { getAccountToken, getCloudWebOrigin } from '../../utils/api';
import { platformRequestHeaders } from '../../platform/platformHeaders';
import { getExtensionUserAgent, getExtensionVersion } from '../../platform/version';

export type FeedbackKind = 'bug' | 'feature' | 'general';

const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Bug report',
  feature: 'Feature request',
  general: 'Feedback',
};
const SUBJECT_PREVIEW_CHARS = 60;

export type FeedbackOutcome =
  { status: 'sent' } | { status: 'signed-out' } | { status: 'failed'; reason: string };

export async function submitFeedback(
  secrets: vscode.SecretStorage,
  kind: FeedbackKind,
  text: string,
): Promise<FeedbackOutcome> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return { status: 'signed-out' };
  const message = text.trim();
  try {
    const response = await fetch(`${getCloudWebOrigin()}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...platformRequestHeaders(),
      },
      body: JSON.stringify({
        subject: `${FEEDBACK_KIND_LABELS[kind]}: ${message.slice(0, SUBJECT_PREVIEW_CHARS)}`,
        message,
        metadata: {
          source: 'vscode',
          platform: `${vscode.env.appName} ${vscode.version} on ${process.platform}`,
          version: getExtensionVersion(),
          user_agent: getExtensionUserAgent(),
        },
      }),
    });
    return response.ok
      ? { status: 'sent' }
      : { status: 'failed', reason: `AGI Workforce answered HTTP ${response.status}` };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'AGI Workforce could not be reached',
    };
  }
}
