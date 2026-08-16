
import 'server-only';

import type { HandoffSessionRow } from './store';
import { sendSupportEmail, type SendEmailResult } from './resend-client';
import { getHandoffConfig } from './config';
import type { HandoffReason } from './types';

const REASON_COPY: Record<HandoffReason, string> = {
  user_requested: 'The user asked for a human',
  hard_abstain: 'The agent refused to answer (billing / data deletion / security / legal)',
  low_confidence: 'The agent was not confident enough to answer',
  no_citation: 'The agent had no source to cite, so it abstained',
  action_refused: 'The agent refused or failed to run an account action',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function formatAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export interface EscalationEmailContent {
  subject: string;
  text: string;
  html: string;
  replyTo: string;
}

export function buildEscalationEmail(
  session: HandoffSessionRow,
  options: { droppedTurns?: number; timedOut?: boolean } = {},
): EscalationEmailContent {
  const ctx = session.account_context;
  const plan = ctx.planTier ?? (ctx.signedIn ? 'unknown' : 'signed out');
  const subject = `[AGI Support] ${session.reference_id} · ${session.reason} · ${plan}`;

  const lines: string[] = [];
  lines.push(`Reference: ${session.reference_id}`);
  lines.push(`Raised: ${formatAt(session.created_at)}`);
  lines.push(`Surface: ${session.surface}`);
  lines.push(`Why escalated: ${REASON_COPY[session.reason]}`);
  if (options.timedOut) {
    lines.push(
      'Note: this started as a live chat request. Nobody picked it up before the wait deadline, so it was emailed instead.',
    );
  }
  lines.push('');
  lines.push('SUMMARY');
  lines.push(session.summary || '(no summary supplied)');
  lines.push('');

  lines.push('WHAT THE AGENT ALREADY TRIED');
  if (session.attempted_actions.length === 0) {
    lines.push('(nothing — the agent did not attempt any account action)');
  } else {
    for (const attempt of session.attempted_actions) {
      lines.push(
        `- ${attempt.action} → ${attempt.outcome}${attempt.detail ? ` (${attempt.detail})` : ''} @ ${formatAt(attempt.at)}`,
      );
    }
  }
  lines.push('');

  lines.push('SOURCES THE AGENT CITED');
  if (session.citations.length === 0) {
    lines.push('(none — the agent had nothing to cite)');
  } else {
    for (const citation of session.citations) {
      lines.push(`- ${citation.title}: ${citation.url}`);
    }
  }
  lines.push('');

  lines.push('ACCOUNT CONTEXT (server-derived, not supplied by the client)');
  lines.push(`- Signed in: ${ctx.signedIn ? 'yes' : 'no'}`);
  lines.push(`- User id: ${ctx.userId ?? '(anonymous)'}`);
  lines.push(`- Contact email: ${session.contact_email}`);
  lines.push(`- Plan: ${ctx.planTier ?? 'unknown'}`);
  lines.push(`- Subscription status: ${ctx.subscriptionStatus ?? 'unknown'}`);
  lines.push(`- Current period ends: ${ctx.currentPeriodEnd ?? 'unknown'}`);
  lines.push(
    `- Usage: ${ctx.usagePercentage === null ? 'unknown' : `${ctx.usagePercentage}%`}` +
      `${ctx.usageResetAt ? ` (resets ${ctx.usageResetAt})` : ''}`,
  );
  lines.push(
    `- Has usage remaining: ${ctx.hasUsageRemaining === null ? 'unknown' : ctx.hasUsageRemaining ? 'yes' : 'no'}`,
  );
  if (ctx.degraded) lines.push(`- NOTE: ${ctx.degraded}`);
  if (session.page_path) lines.push(`- Page: ${session.page_path}`);
  if (session.locale) lines.push(`- Locale: ${session.locale}`);
  lines.push('');

  lines.push('TRANSCRIPT (oldest first)');
  if (options.droppedTurns && options.droppedTurns > 0) {
    lines.push(`[${options.droppedTurns} earlier turns omitted to fit the size cap]`);
  }
  if (session.transcript.length === 0) {
    lines.push('(empty)');
  } else {
    for (const turn of session.transcript) {
      lines.push(`[${formatAt(turn.at)}] ${turn.role.toUpperCase()}: ${turn.content}`);
    }
  }

  const text = lines.join('\n');

  const html = [
    '<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5">',
    `<h2 style="font-family:system-ui,sans-serif">${escapeHtml(session.reference_id)}</h2>`,
    `<pre style="white-space:pre-wrap;word-break:break-word">${escapeHtml(text)}</pre>`,
    '</div>',
  ].join('');

  return { subject, text, html, replyTo: session.contact_email };
}

export async function sendEscalationEmail(
  session: HandoffSessionRow,
  options: { droppedTurns?: number; timedOut?: boolean } = {},
): Promise<SendEmailResult> {
  const config = getHandoffConfig();
  const content = buildEscalationEmail(session, options);
  return sendSupportEmail({
    to: config.fallbackEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: content.replyTo,
  });
}
