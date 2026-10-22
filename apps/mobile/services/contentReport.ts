/**
 * Content report / flag service.
 *
 * Google Play GenAI policy requires an in-app mechanism for users to flag
 * harmful or inaccurate AI-generated content. This service:
 *
 *   1. Saves the report locally to MMKV first, so a failing network can never
 *      lose it (local-first).
 *   2. Submits the report to the server intake route
 *      `POST /api/mobile/content-report` (apps/web) so it reaches the AGI
 *      trust-and-safety queue (MOBILE-CONTENT-REPORT-NO-INTAKE-ENDPOINT-01).
 *   3. Optionally hands the report to the device mail client, addressed to
 *      support, when the user asks for that explicitly.
 *   4. When the first send fails (offline, Local Mode), asks the user before
 *      sending that one report, then queues it until a send succeeds. Only that
 *      consented send may pass the Local Mode egress guard (`consentedReport`).
 *
 * The on-device copy is now an OFFLINE fallback, not the only sink. Reporting
 * still has to work in Local Mode, where the egress guard refuses our-cloud
 * requests outright: there the server POST throws, is caught, and the report
 * stays on the device. Every caller must describe the ACTUAL outcome truthfully
 * (see ReportDelivery), a report that never left the phone must never read as
 * "submitted".
 *
 * No new npm deps. The server POST goes through the shared `api` client (auth +
 * egress guard). Email uses React Native's Linking.openURL with a mailto deep
 * link, the OS mail client handles the actual send, and the user still has to
 * press send there.
 *
 * MMKV key: "content-reports:v1" → JSON array of ContentReport
 */

import NetInfo from '@react-native-community/netinfo';
import { Linking } from 'react-native';
import { storage } from '@/lib/mmkv';
import { CONTENT_REPORT_PATH } from '@/lib/egressGuard';
import { api } from '@/services/api';
import type { ReportAsset } from '@/services/contentReportAsset';
import { SUPPORT_EMAIL } from '@/src/features/support/contact';

export type ReportCategory =
  'harmful' | 'inaccurate' | 'offensive' | 'misinformation' | 'privacy' | 'other';

export type { ReportAsset } from '@/services/contentReportAsset';

export type SharedReportItem = {
  kind: 'project' | 'conversation' | 'artifact' | 'connector' | 'agent';
  id: string;
  sharerId: string;
};

export type ContentReport = {
  id: string;
  messageId: string;
  conversationId: string;
  contentExcerpt: string;
  category: ReportCategory;
  userNote: string;
  createdAt: string;
  emailHandoffOpened: boolean;
  serverAcknowledged: boolean;
  asset?: ReportAsset;
  sharedItem?: SharedReportItem;
  /** The user agreed to send this one report after it could not be sent at once. */
  uploadConsented?: boolean;
};

export type ReportDelivery =
  /** Accepted by the server trust-and-safety intake route. */
  | { kind: 'submitted-to-server' }
  /** Written to this device only. Nothing left the phone (offline / Local Mode). */
  | { kind: 'stored-on-device' }
  /** The user agreed to send it; it is queued until the send succeeds. */
  | { kind: 'queued-for-upload' }
  /** Written to this device, and the mail client opened with it filled in. */
  | { kind: 'email-composer-opened' }
  /** Written to this device; no mail client could be opened. */
  | { kind: 'email-unavailable' };

export type SaveContentReportResult = {
  report: ContentReport;
  delivery: ReportDelivery;
};

const MMKV_KEY = 'content-reports:v1';
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

export function getContentReports(): ContentReport[] {
  return readReports();
}

export function clearContentReports(): void {
  storage.delete(MMKV_KEY);
}

/**
 * Opens the device mail client with the report pre-filled, addressed to
 * support, and records that the hand-off happened.
 *
 * @returns true only if the mail client was actually opened.
 */
export async function openSupportEmail(report: ContentReport): Promise<boolean> {
  const subject = encodeURIComponent(`[AGI Content Report] ${report.category}`);
  const body = encodeURIComponent(
    [
      `Category: ${report.category}`,
      `Message ID: ${report.messageId}`,
      `Conversation ID: ${report.conversationId}`,
      ...(report.asset ? [`Asset: ${report.asset.kind} ${report.asset.url}`] : []),
      ...(report.sharedItem
        ? [
            `Shared ${report.sharedItem.kind}: ${report.sharedItem.id}`,
            `Shared by: ${report.sharedItem.sharerId}`,
          ]
        : []),
      `Reported at: ${report.createdAt}`,
      '',
      'Content excerpt:',
      report.contentExcerpt,
      '',
      'User note:',
      report.userNote || '(none)',
    ].join('\n'),
  );
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

  try {
    const canOpen = await Linking.canOpenURL(mailto);
    if (!canOpen) return false;
    await Linking.openURL(mailto);
  } catch {
    return false;
  }

  try {
    markHandoffOpened(report.id);
  } catch {
    return true;
  }
  return true;
}

/**
 * Submit a report to the server intake route. Never throws: offline, a
 * Local-Mode egress block, or a server error all resolve to `false` so the
 * on-device copy remains the fallback and the report is never lost.
 *
 * @returns true only if the server accepted the report.
 */
async function submitReportToServer(report: ContentReport): Promise<boolean> {
  const body = {
    reportId: report.id,
    messageId: report.messageId,
    conversationId: report.conversationId,
    category: report.category,
    contentExcerpt: report.contentExcerpt,
    userNote: report.userNote,
    ...(report.asset ? { asset: report.asset } : {}),
    ...(report.sharedItem ? { sharedItem: report.sharedItem } : {}),
  };
  try {
    if (report.uploadConsented) {
      await api.post(CONTENT_REPORT_PATH, body, { consentedReport: true });
    } else {
      await api.post(CONTENT_REPORT_PATH, body);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves a content report locally, submits it to the server intake route (with an
 * on-device offline fallback), and, if sendEmail is true, also opens the
 * device mail client pre-filled with the report details.
 *
 * @returns the saved record plus what actually happened to it.
 */
export async function saveContentReport(params: {
  messageId: string;
  conversationId: string;
  contentExcerpt: string;
  category: ReportCategory;
  userNote: string;
  sendEmail: boolean;
  asset?: ReportAsset;
  sharedItem?: SharedReportItem;
}): Promise<SaveContentReportResult> {
  const report: ContentReport = {
    id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    messageId: params.messageId,
    conversationId: params.conversationId,
    contentExcerpt: params.contentExcerpt.slice(0, MAX_EXCERPT_LEN),
    category: params.category,
    userNote: params.userNote.trim(),
    createdAt: new Date().toISOString(),
    emailHandoffOpened: false,
    serverAcknowledged: false,
    ...(params.asset ? { asset: params.asset } : {}),
    ...(params.sharedItem ? { sharedItem: params.sharedItem } : {}),
  };

  const existing = readReports();
  const updated = [report, ...existing].slice(0, MAX_STORED_REPORTS);
  writeReports(updated);

  // Primary sink: the server trust-and-safety intake. Falls back to on-device
  const submitted = await submitReportToServer(report);
  if (submitted) {
    report.serverAcknowledged = true;
    try {
      markServerAcknowledged(report.id);
    } catch {
      // Server acceptance remains authoritative if the local status write fails.
    }
  }

  if (!params.sendEmail) {
    return {
      report,
      delivery: { kind: submitted ? 'submitted-to-server' : 'stored-on-device' },
    };
  }

  const opened = await openSupportEmail(report);
  if (opened) {
    return {
      report: { ...report, emailHandoffOpened: true },
      delivery: { kind: 'email-composer-opened' },
    };
  }
  return {
    report,
    delivery: { kind: submitted ? 'submitted-to-server' : 'email-unavailable' },
  };
}

/**
 * Records the user's consent to send one report that stayed on the device, then
 * tries to send it. A report that still cannot be sent stays queued and goes out
 * on the next {@link flushQueuedContentReports}.
 */
export async function sendStoredContentReport(reportId: string): Promise<ReportDelivery> {
  updateReport(reportId, { uploadConsented: true });
  const report = readReports().find((entry) => entry.id === reportId);
  if (!report) throw new Error('Report is no longer stored on this device');
  if (report.serverAcknowledged) return { kind: 'submitted-to-server' };
  if (!(await submitReportToServer(report))) {
    watchForConnectivity();
    return { kind: 'queued-for-upload' };
  }
  try {
    markServerAcknowledged(reportId);
  } catch {
    // Server acceptance remains authoritative if the local status write fails.
  }
  return { kind: 'submitted-to-server' };
}

export function queuedContentReports(): ContentReport[] {
  return readReports().filter((entry) => entry.uploadConsented && !entry.serverAcknowledged);
}

let flushing: Promise<number> | null = null;

/** Sends every consented, unsent report. Resolves to how many were accepted. */
export function flushQueuedContentReports(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const report of queuedContentReports()) {
      if (!(await submitReportToServer(report))) continue;
      sent += 1;
      try {
        markServerAcknowledged(report.id);
      } catch {
        // A later flush re-sends it; the server dedupes on the report id.
      }
    }
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

let unsubscribeConnectivity: (() => void) | null = null;

/** Flushes the queue whenever the device comes online, until it is empty. */
export function watchForConnectivity(): void {
  if (unsubscribeConnectivity || queuedContentReports().length === 0) return;
  unsubscribeConnectivity = NetInfo.addEventListener((state) => {
    if (!state.isConnected) return;
    void flushQueuedContentReports().then(() => {
      if (queuedContentReports().length > 0 || !unsubscribeConnectivity) return;
      unsubscribeConnectivity();
      unsubscribeConnectivity = null;
    });
  });
}

let resumed = false;

/** Picks up reports queued in an earlier session; runs once per app process. */
export function resumeQueuedContentReports(): void {
  if (resumed) return;
  resumed = true;
  watchForConnectivity();
}

function updateReport(reportId: string, patch: Partial<ContentReport>): void {
  const reports = readReports();
  const index = reports.findIndex((entry) => entry.id === reportId);
  if (index === -1) return;
  const target = reports[index];
  if (!target) return;
  reports[index] = { ...target, ...patch };
  writeReports(reports);
}

function markServerAcknowledged(reportId: string): void {
  updateReport(reportId, { serverAcknowledged: true });
}

function markHandoffOpened(reportId: string): void {
  updateReport(reportId, { emailHandoffOpened: true });
}
