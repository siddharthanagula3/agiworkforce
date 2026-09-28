import { setChild } from '../../dom-helpers';
import { el } from './dom';
import { Mic, renderIcon } from '../../assets/icons';
import {
  DICTATION_LANGUAGE_KEY,
  activeDictationLanguage,
  languageLabel,
} from './dictation-language';

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
};

const MICROPHONE_BLOCKED_MESSAGE =
  'Microphone access is blocked. Allow the microphone for AGI in Chrome site settings, then try again.';

const MICROPHONE_NOTICE_ACK_KEY = 'agi.notice.microphone';

const MICROPHONE_NOTICE_TEXT =
  'Dictation uses your microphone only while it is listening, from when you press the microphone until you press it again. Chrome turns your speech into text with its speech service, and AGI receives only that text, which stays in this chat like anything you type. Chrome asks for microphone access next. If you block it, allow the microphone for AGI in Chrome site settings.';

const VOICE_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': MICROPHONE_BLOCKED_MESSAGE,
  'service-not-allowed': 'Voice recognition is not available in this browser profile.',
  'audio-capture': 'No microphone was found.',
  'no-speech': 'No speech was heard. Try again and speak after the button starts pulsing.',
  network: 'Voice recognition needs a network connection.',
  aborted: '',
};

export function describeVoiceError(code: string | undefined): string {
  if (code === undefined) return 'Voice input failed. Try again.';
  const known = VOICE_ERROR_MESSAGES[code];
  if (known !== undefined) return known;
  return 'Voice input failed. Try again.';
}

export function micTooltip(language: string | null): string {
  return language ? `Voice input · ${languageLabel(language)}` : 'Voice input';
}

type MicrophonePermission = PermissionState | 'unknown';

async function microphonePermission(): Promise<MicrophonePermission> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

async function microphoneNoticeAcknowledged(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(MICROPHONE_NOTICE_ACK_KEY);
    return stored[MICROPHONE_NOTICE_ACK_KEY] === true;
  } catch {
    return false;
  }
}

export interface MicrophoneNotice {
  element: HTMLElement;
  ask(onContinue: () => void, returnFocus: HTMLElement): void;
}

export function buildMicrophoneNotice(): MicrophoneNotice {
  const element = el('div', {
    id: 'sp-mic-notice',
    class: 'sp-composer-notice',
    role: 'note',
    'aria-label': 'Before you dictate',
  });
  element.appendChild(el('span', {}, MICROPHONE_NOTICE_TEXT));
  const declineBtn = el(
    'button',
    { class: 'sp-composer-notice-action', type: 'button' },
    'Not now',
  );
  const continueBtn = el(
    'button',
    { class: 'sp-composer-notice-action', type: 'button' },
    'Continue',
  );
  element.appendChild(declineBtn);
  element.appendChild(continueBtn);

  let pending: { onContinue: () => void; returnFocus: HTMLElement } | null = null;
  const close = (): void => {
    const request = pending;
    pending = null;
    element.classList.remove('visible');
    request?.returnFocus.focus();
  };
  declineBtn.addEventListener('click', () => {
    close();
  });
  continueBtn.addEventListener('click', () => {
    const request = pending;
    close();
    if (!request) return;
    void chrome.storage.local.set({ [MICROPHONE_NOTICE_ACK_KEY]: true });
    request.onContinue();
  });
  element.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });

  return {
    element,
    ask(onContinue, returnFocus) {
      pending = { onContinue, returnFocus };
      element.classList.add('visible');
      continueBtn.focus();
    },
  };
}

export function setupVoiceInput(
  micBtn: HTMLButtonElement,
  inputEl: HTMLTextAreaElement,
  autoResize: (el: HTMLTextAreaElement) => void,
  onError: (message: string) => void,
  notice: MicrophoneNotice,
): void {
  const w = window as unknown as Record<string, unknown>;
  const SpeechRecognitionCtor: SpeechRecognitionCtor | undefined =
    (w['SpeechRecognition'] as SpeechRecognitionCtor | undefined) ??
    (w['webkitSpeechRecognition'] as SpeechRecognitionCtor | undefined);

  if (!SpeechRecognitionCtor) {
    micBtn.title = 'Voice input is not supported in this browser';
    micBtn.disabled = true;
    micBtn.setAttribute('aria-disabled', 'true');
    return;
  }
  micBtn.title = micTooltip(null);

  let recognition: InstanceType<SpeechRecognitionCtor> | null = null;
  let listening = false;
  let language: string | null = null;

  const refreshLanguage = async (): Promise<void> => {
    language = await activeDictationLanguage();
    if (!listening) micBtn.title = micTooltip(language);
  };

  void refreshLanguage();
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && DICTATION_LANGUAGE_KEY in changes) void refreshLanguage();
  });

  const startListening = (): void => {
    recognition = new SpeechRecognitionCtor();
    if (language) recognition.lang = language;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add('active');
      setChild(micBtn, { tag: 'span', className: 'sp-mic-pulse' });
      micBtn.title = 'Listening… click to stop';
    };

    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      const transcript = (event.results[0]?.[0]?.transcript ?? '') as string;
      if (transcript) {
        inputEl.value = inputEl.value ? `${inputEl.value} ${transcript}` : transcript;
        autoResize(inputEl);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    recognition.onerror = (event) => {
      const message = describeVoiceError(event?.error);
      if (message) onError(message);
    };

    recognition.onend = () => {
      listening = false;
      if (document.body) {
        micBtn.classList.remove('active');
        micBtn.replaceChildren(renderIcon(Mic, 14));
        micBtn.title = micTooltip(language);
      }
      recognition = null;
    };

    recognition.start();
  };

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition?.stop();
      return;
    }
    void (async () => {
      const permission = await microphonePermission();
      if (permission === 'denied') {
        onError(MICROPHONE_BLOCKED_MESSAGE);
        return;
      }
      if (permission === 'granted' || (await microphoneNoticeAcknowledged())) {
        startListening();
        return;
      }
      notice.ask(startListening, micBtn);
    })();
  });
}
