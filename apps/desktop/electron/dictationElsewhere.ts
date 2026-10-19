import {
  MAX_DICTATION_TEXT_LENGTH,
  type HostDictationOutcome,
} from '@agiworkforce/local-runtime-contract';

export interface DictationApp {
  name: string;
  pid: number;
  secureInput: boolean;
}

export interface DictationBar {
  readonly contentsId: number;
  toggle(): void;
  close(): void;
}

export interface DictationElsewhereDeps {
  frontApp(): Promise<DictationApp | null>;
  openBar(): DictationBar;
  typeText(text: string): Promise<void>;
  copyText(text: string): void;
  notify(title: string, body: string): void;
  ownPid: number;
  now(): number;
}

export const DICTATION_SESSION_LIMIT_MS = 10 * 60_000;

const LINE_BREAKS = /[\r\n\u0085\u2028\u2029]+/g;
const FORMATTING = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u;

function isInvisible(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || FORMATTING.test(char);
}

/**
 * The text a dictation may type, or null. A line break would press Return in
 * the app in front, which in a terminal runs whatever is on the line, so every
 * break becomes a space; invisible and direction-changing characters are
 * dropped so what lands is what the user saw in the bar.
 */
export function dictationText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(LINE_BREAKS, ' ')
    .split('')
    .filter((char) => !isInvisible(char))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (text === '' || text.length > MAX_DICTATION_TEXT_LENGTH) return null;
  return text;
}

interface Listening {
  target: DictationApp;
  bar: DictationBar;
  startedAt: number;
}

/**
 * Dictation into the app that was in front when the shortcut was pressed.
 *
 * The bar is a page, and the page only hands back text. What it may type, into
 * which app and how often is decided here: once per press, from the bar this
 * press opened, into the app that was in front at the press and still is, and
 * never into a field macOS is guarding for a password. Anything else goes to
 * the clipboard with a note saying why, or nowhere.
 */
export function createDictationElsewhere(deps: DictationElsewhereDeps) {
  let listening: Listening | null = null;

  const end = (): Listening | null => {
    const ended = listening;
    listening = null;
    ended?.bar.close();
    return ended;
  };

  const copied = (text: string, reason: string): HostDictationOutcome => {
    deps.copyText(text);
    deps.notify('Dictation copied', `${reason} Paste it where you want it.`);
    return 'copied';
  };

  return {
    isListening(): boolean {
      return listening !== null;
    },

    /**
     * Answers true when the press was taken here: a second press stops the
     * bar that is up, and a first press over another app opens one.
     */
    async handlePress(): Promise<boolean> {
      if (listening) {
        if (deps.now() - listening.startedAt > DICTATION_SESSION_LIMIT_MS) {
          end();
          return true;
        }
        listening.bar.toggle();
        return true;
      }
      const target = await deps.frontApp();
      if (!target || target.pid === deps.ownPid) return false;
      listening = { target, bar: deps.openBar(), startedAt: deps.now() };
      return true;
    },

    async finish(senderId: number, raw: unknown): Promise<HostDictationOutcome> {
      if (!listening || listening.bar.contentsId !== senderId) {
        throw new Error('No dictation is waiting for this text.');
      }
      const ended = end();
      if (!ended) throw new Error('No dictation is waiting for this text.');
      const text = dictationText(raw);
      if (text === null) throw new Error('There is no text to type.');
      if (deps.now() - ended.startedAt > DICTATION_SESSION_LIMIT_MS) {
        return copied(text, 'The dictation ran too long to type it for you.');
      }
      const front = await deps.frontApp().catch(() => null);
      if (!front || front.pid !== ended.target.pid) {
        return copied(text, `${ended.target.name} is no longer in front, so nothing was typed.`);
      }
      if (front.secureInput) {
        return copied(text, `${front.name} is asking for a password, so nothing was typed.`);
      }
      try {
        await deps.typeText(text);
      } catch {
        return copied(text, `It could not be typed into ${front.name}.`);
      }
      return 'typed';
    },

    cancel(senderId: number): void {
      if (listening && listening.bar.contentsId === senderId) end();
    },

    closeAll(): void {
      end();
    },
  };
}

export type DictationElsewhere = ReturnType<typeof createDictationElsewhere>;
