/**
 * Content report / flag service.
 *
 * Google Play GenAI policy requires an in-app mechanism for users to flag
 * harmful or inaccurate AI-generated content. This service:
 *
 *   1. Saves the report locally to MMKV (local-first, no server required)
 *   2. Optionally queues a support email if the user opts in at flag time
 *
 * No new npm deps. Email uses React Native's Linking.openURL with a mailto
 * deep link — the OS mail client handles the actual send.
 *
 * MMKV key: "content-reports:v1" → JSON array of ContentReport
 */

import { Linking } from 'react-native';
import { storage } from '@/lib/mmkv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportCategory =
  | 'harmful'
  | 'inaccurate'
  | 'offensive'
  | 'misinformation'
  | 'privacy'
  | 'other';

export type ContentReport = {
  id: string;
  messageId: string;
  conversationId: string;
  /** Abbreviated content excerpt — max 500 chars to avoid storing full responses */
  contentExcerpt: string;
  category: ReportCategory;
  userNote: string;
  createdAt: string;
  /** Whether the user opted to email the report to support */
  emailedToSupport: boolean;
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const MMKV_KEY = 'content-reports:v1';
const SUPPORT_EMAIL = 'support@agiworkforce.com';
const MAX_EXCERPT_LEN = 500;
const MAX_STORED_REPORTS = 100;

function readReports(): ContentReport[] {
  const raw = storage.getString(MMKV_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ContentReport[];
  } catch {
    return [];
  }
}

function writeReports(reports: ContentReport[]): void {
  storage.set(MMKV_KEY, JSON.stringify(reports));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns all stored content reports. */
export function getContentReports(): ContentReport[] {
  return readReports();
}

/** Clears all stored reports (DSAR erasure path). */
export function clearContentReports(): void {
  storage.delete(MMKV_KEY);
}

/**
 * Saves a content report locally. If sendEmail is true, opens the device
 * mail client pre-filled with the report details.
 *
 * @returns The saved ContentReport record.
 */
export async function saveContentReport(params: {
  messageId: string;
  conversationId: string;
  contentExcerpt: string;
  category: ReportCategory;
  userNote: string;
  sendEmail: boolean;
}): Promise<ContentReport> {
  const report: ContentReport = {
    id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    messageId: params.messageId,
    conversationId: params.conversationId,
    contentExcerpt: params.contentExcerpt.slice(0, MAX_EXCERPT_LEN),
    category: params.category,
    userNote: params.userNote.trim(),
    createdAt: new Date().toISOString(),
    emailedToSupport: params.sendEmail,
  };

  const existing = readReports();
  const updated = [report, ...existing].slice(0, MAX_STORED_REPORTS);
  writeReports(updated);

  if (params.sendEmail) {
    const subject = encodeURIComponent(`[AGI Content Report] ${params.category}`);
    const body = encodeURIComponent(
      [
        `Category: ${params.category}`,
        `Message ID: ${params.messageId}`,
        `Conversation ID: ${params.conversationId}`,
        `Reported at: ${report.createdAt}`,
        '',
        'Content excerpt:',
        params.contentExcerpt.slice(0, MAX_EXCERPT_LEN),
        '',
        'User note:',
        params.userNote.trim() || '(none)',
      ].join('\n'),
    );
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    try {
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
      }
    } catch {
      // Mail client unavailable — report is still saved locally
    }
  }

  return report;
}
