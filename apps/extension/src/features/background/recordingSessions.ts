import { recordedPageKey } from '../shortcuts/recordedPages';
import type { RunPageAction } from '../../types';
import { validateShortcutActions } from '../../background/policy';

const STORAGE_KEY = 'agi_recording_sessions';
export const MAX_RECORDED_ACTIONS = 500;

export type RecordingSessionState = 'recording' | 'stopped' | 'navigated';

export interface RecordingSession {
  origin: string;
  state: RecordingSessionState;
  actions: RunPageAction[];
  followPages?: boolean;
  captureValues?: boolean;
  pageOrigin?: string;
}

type Sessions = Record<string, RecordingSession>;

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => undefined);
  return result;
}

async function readSessions(): Promise<Sessions> {
  const stored = (await chrome.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
  return stored && typeof stored === 'object' ? (stored as Sessions) : {};
}

function writeSessions(sessions: Sessions): Promise<void> {
  return chrome.storage.session.set({ [STORAGE_KEY]: sessions });
}

function originOf(url: string | undefined): string | null {
  try {
    const parsed = new URL(url ?? '');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

function recordedAction(raw: unknown): RunPageAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const type = record['type'];
  if (type !== 'click' && type !== 'input' && type !== 'scroll' && type !== 'navigate') return null;
  const action: RunPageAction = {
    id: typeof record['id'] === 'string' ? record['id'] : crypto.randomUUID(),
    type,
    selector: typeof record['selector'] === 'string' ? record['selector'] : null,
    ...(typeof record['value'] === 'string' ? { value: record['value'] } : {}),
  };
  return validateShortcutActions([action]) ? action : null;
}

export function beginRecordingSession(
  tabId: number,
  tabUrl: string | undefined,
  followPages = false,
  captureValues = false,
): Promise<boolean> {
  return serialized(async () => {
    const origin = originOf(tabUrl);
    if (!origin) return false;
    const sessions = await readSessions();
    sessions[String(tabId)] = {
      origin,
      state: 'recording',
      actions: [],
      ...(followPages ? { followPages, captureValues, pageOrigin: origin } : {}),
    };
    await writeSessions(sessions);
    return true;
  });
}

/** Appends one step the page reported. False when this tab is not recording that site. */
export function appendRecordedAction(
  tabId: number,
  senderUrl: string | undefined,
  raw: unknown,
  targetDescription?: string,
): Promise<boolean> {
  return serialized(async () => {
    const sessions = await readSessions();
    const session = sessions[String(tabId)];
    if (!session || session.state !== 'recording') return false;
    if (!senderUrl || originOf(senderUrl) !== (session.pageOrigin ?? session.origin)) return false;
    const action = recordedAction(raw);
    if (!action) return true;
    if (session.actions.length >= MAX_RECORDED_ACTIONS) return true;
    if (session.followPages) {
      if (action.type === 'navigate') return true;
      if (
        typeof targetDescription === 'string' &&
        targetDescription.length > 0 &&
        targetDescription.length <= 1024
      )
        action.targetFingerprint = await recordedPageKey(targetDescription);
      action.recordedPage = await recordedPageKey(senderUrl);
      action.recordedOrigin = session.pageOrigin ?? session.origin;
    }
    session.actions.push(action);
    await writeSessions(sessions);
    return true;
  });
}

export function readRecordingSession(tabId: number): Promise<RecordingSession | null> {
  return serialized(async () => (await readSessions())[String(tabId)] ?? null);
}

/** Ends a session that is still recording. A session that already ended keeps its reason. */
export function endRecordingSession(
  tabId: number,
  state: Exclude<RecordingSessionState, 'recording'>,
): Promise<RecordingSession | null> {
  return serialized(async () => {
    const sessions = await readSessions();
    const session = sessions[String(tabId)];
    if (!session) return null;
    if (session.state === 'recording') {
      session.state = state;
      await writeSessions(sessions);
    }
    return session;
  });
}

export function discardRecordingSession(tabId: number): Promise<void> {
  return serialized(async () => {
    const sessions = await readSessions();
    if (!(String(tabId) in sessions)) return;
    delete sessions[String(tabId)];
    await writeSessions(sessions);
  });
}

export function discardAllRecordingSessions(): Promise<void> {
  return serialized(() => chrome.storage.session.remove(STORAGE_KEY));
}

export function resumeRecordingOrigin(
  tabId: number,
  origin: string,
): Promise<RecordingSession | null> {
  return serialized(async () => {
    const sessions = await readSessions();
    const session = sessions[String(tabId)];
    if (!session?.followPages || session.state !== 'recording') return null;
    session.pageOrigin = origin;
    await writeSessions(sessions);
    return session;
  });
}
