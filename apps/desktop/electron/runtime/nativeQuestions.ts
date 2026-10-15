import type { BrowserWindow, MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import { showDevicePrompt } from './devicePrompts';

/**
 * A native question is raised because a page, an agent or a phone asked for
 * something, and whoever asks chooses when and how often. Left alone, a page
 * can stack sheets behind one another and raise each again the moment it is
 * cancelled, until the person presses the wrong button to make them stop.
 *
 * So every question names what it is about. `group` is the kind of thing and
 * where, such as a command in one folder; `key` is the exact thing. One
 * question per key is open at a time and a second asker joins it, and no
 * more than `OPEN_QUESTION_LIMIT` wait at once, whatever they are about.
 *
 * `quietAfterCancel` is for what a page or an agent can ask for over and
 * over with nobody having clicked anything: a command, a screen run, a
 * Bypass turn. There a Cancel is remembered for that key, and three Cancels
 * in a group quiet the whole group, both for `DECLINED_QUIET_MS`. A question
 * that is not asked is answered as Cancel, with `notAsked` saying why.
 */
export interface QuestionSubject {
  group: string;
  key: string;
  quietAfterCancel?: boolean;
}

export type QuestionNotAsked = 'cancelled-recently' | 'too-many-open';

export interface NativeAnswer extends MessageBoxReturnValue {
  notAsked?: QuestionNotAsked;
}

export const NOT_ASKED_MESSAGES: Record<QuestionNotAsked, string> = {
  'cancelled-recently':
    'You chose Cancel for this, or for several questions like it, a moment ago, so it was not asked again. Try again in a minute.',
  'too-many-open':
    'AGI Cloud is already waiting for your answer to other questions. Answer those first.',
};

export const OPEN_QUESTION_LIMIT = 3;
export const DECLINED_QUIET_MS = 60_000;
export const GROUP_DECLINES_BEFORE_QUIET = 3;
const REMEMBERED_LIMIT = 500;

const open = new Map<string, Promise<NativeAnswer>>();
const declinedKeys = new Map<string, number>();
const declinedGroups = new Map<string, number[]>();

function keyOf(subject: QuestionSubject): string {
  return JSON.stringify([subject.group, subject.key]);
}

function cancelOf(options: MessageBoxOptions): number {
  return options.cancelId ?? 0;
}

function remember<T>(map: Map<string, T>, key: string, value: T): void {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= REMEMBERED_LIMIT) break;
    map.delete(oldest);
  }
}

function quiet(subject: QuestionSubject, now: number): boolean {
  if (subject.quietAfterCancel !== true) return false;
  const declinedAt = declinedKeys.get(keyOf(subject));
  if (declinedAt !== undefined && now - declinedAt < DECLINED_QUIET_MS) return true;
  const recent = (declinedGroups.get(subject.group) ?? []).filter(
    (at) => now - at < DECLINED_QUIET_MS,
  );
  return recent.length >= GROUP_DECLINES_BEFORE_QUIET;
}

function noteDeclined(subject: QuestionSubject, now: number): void {
  if (subject.quietAfterCancel !== true) return;
  remember(declinedKeys, keyOf(subject), now);
  const recent = (declinedGroups.get(subject.group) ?? []).filter(
    (at) => now - at < DECLINED_QUIET_MS,
  );
  remember(declinedGroups, subject.group, [...recent, now]);
}

export function askNativeQuestion(
  window: BrowserWindow | null,
  subject: QuestionSubject,
  options: MessageBoxOptions,
): Promise<NativeAnswer> {
  const notAsked = (why: QuestionNotAsked): Promise<NativeAnswer> =>
    Promise.resolve({ response: cancelOf(options), checkboxChecked: false, notAsked: why });
  const key = keyOf(subject);
  const waiting = open.get(key);
  if (waiting) return waiting;
  if (quiet(subject, Date.now())) return notAsked('cancelled-recently');
  if (open.size >= OPEN_QUESTION_LIMIT) return notAsked('too-many-open');
  const asked = showDevicePrompt(window, options)
    .then((result): NativeAnswer => {
      if (result.response === cancelOf(options)) noteDeclined(subject, Date.now());
      return result;
    })
    .finally(() => {
      open.delete(key);
    });
  open.set(key, asked);
  return asked;
}

export function resetNativeQuestions(): void {
  open.clear();
  declinedKeys.clear();
  declinedGroups.clear();
}
