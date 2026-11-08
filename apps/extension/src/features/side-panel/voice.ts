import { setChild } from '../../dom-helpers';
import { el } from './dom';
import { Mic, renderIcon } from '../../assets/icons';
import { t } from '../../i18n';
import {
  DICTATION_LANGUAGE_KEY,
  activeDictationLanguage,
  languageLabel,
} from './dictation-language';
import { appendComposerText } from './composerText';

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
  abort(): void;
};

const MICROPHONE_NOTICE_ACK_KEY = 'agi.notice.microphone';

export function describeVoiceError(code: string | undefined): string {
  switch (code) {
    case 'aborted':
      return '';
    case 'not-allowed':
      return t('spVoiceMicBlocked');
    case 'service-not-allowed':
      return t('spVoiceErrorServiceNotAllowed');
    case 'audio-capture':
      return t('spVoiceErrorAudioCapture');
    case 'no-speech':
      return t('spVoiceErrorNoSpeech');
    case 'network':
      return t('spVoiceErrorNetwork');
    default:
      return t('spVoiceErrorGeneric');
  }
}

export function micTooltip(language: string | null): string {
  return language ? t('spVoiceTooltipLanguage', [languageLabel(language)]) : t('spVoiceTooltip');
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
  close(): void;
}

export function buildMicrophoneNotice(): MicrophoneNotice {
  const element = el('div', {
    id: 'sp-mic-notice',
    class: 'sp-composer-notice',
    role: 'note',
    'aria-label': t('spVoiceNoticeAria'),
  });
  element.appendChild(el('span', {}, t('spVoiceNotice')));
  const declineBtn = el(
    'button',
    { class: 'sp-composer-notice-action', type: 'button' },
    t('spVoiceNoticeDecline'),
  );
  const continueBtn = el(
    'button',
    { class: 'sp-composer-notice-action', type: 'button' },
    t('spVoiceNoticeContinue'),
  );
  element.appendChild(declineBtn);
  element.appendChild(continueBtn);

  let pending: { onContinue: () => void; returnFocus: HTMLElement } | null = null;
  const close = (returnFocus = true): void => {
    const request = pending;
    pending = null;
    element.classList.remove('visible');
    if (returnFocus) request?.returnFocus.focus();
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
    close: () => close(false),
    ask(onContinue, returnFocus) {
      pending = { onContinue, returnFocus };
      element.classList.add('visible');
      continueBtn.focus();
    },
  };
}

export interface VoiceInputAPI {
  reset(): void;
}

export function setupVoiceInput(
  micBtn: HTMLButtonElement,
  inputEl: HTMLTextAreaElement,
  autoResize: (el: HTMLTextAreaElement) => void,
  onError: (message: string) => void,
  notice: MicrophoneNotice,
): VoiceInputAPI {
  const w = window as unknown as Record<string, unknown>;
  const SpeechRecognitionCtor: SpeechRecognitionCtor | undefined =
    (w['SpeechRecognition'] as SpeechRecognitionCtor | undefined) ??
    (w['webkitSpeechRecognition'] as SpeechRecognitionCtor | undefined);

  if (!SpeechRecognitionCtor) {
    micBtn.title = t('spVoiceUnsupported');
    micBtn.disabled = true;
    micBtn.setAttribute('aria-disabled', 'true');
    return { reset: () => notice.close() };
  }
  micBtn.title = micTooltip(null);

  let recognition: InstanceType<SpeechRecognitionCtor> | null = null;
  let listening = false;
  let language: string | null = null;
  let generation = 0;
  let pendingStart = false;
  let stopRequested = false;

  const renderIdle = (): void => {
    listening = false;
    micBtn.classList.remove('active');
    micBtn.replaceChildren(renderIcon(Mic, 14));
    micBtn.title = micTooltip(language);
    micBtn.setAttribute('aria-pressed', 'false');
  };

  const reset = (): void => {
    generation += 1;
    pendingStart = false;
    notice.close();
    const current = recognition;
    recognition = null;
    renderIdle();
    if (current) {
      current.onstart = null;
      current.onend = null;
      current.onerror = null;
      current.onresult = null;
      current.abort();
    }
  };

  const refreshLanguage = async (): Promise<void> => {
    language = await activeDictationLanguage();
    if (!listening) micBtn.title = micTooltip(language);
  };

  void refreshLanguage();
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && DICTATION_LANGUAGE_KEY in changes) void refreshLanguage();
  });

  const startListening = (expectedGeneration: number): void => {
    if (generation !== expectedGeneration) return;
    pendingStart = false;
    if (micBtn.disabled || inputEl.disabled) return;
    stopRequested = false;
    let receivedTranscript = false;
    const current = new SpeechRecognitionCtor();
    recognition = current;
    const isCurrent = (): boolean => generation === expectedGeneration && recognition === current;
    if (language) current.lang = language;
    current.interimResults = false;
    current.maxAlternatives = 1;

    current.onstart = () => {
      if (!isCurrent()) return;
      listening = true;
      micBtn.classList.add('active');
      micBtn.setAttribute('aria-pressed', 'true');
      setChild(micBtn, { tag: 'span', className: 'sp-mic-pulse' });
      micBtn.title = t('spVoiceListening');
    };

    current.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      if (!isCurrent()) return;
      const transcript = (event.results[0]?.[0]?.transcript ?? '') as string;
      if (transcript) {
        receivedTranscript = true;
        appendComposerText(inputEl, transcript);
        autoResize(inputEl);
      }
    };

    current.onerror = (event) => {
      if (!isCurrent()) return;
      recognition = null;
      renderIdle();
      const message = describeVoiceError(event?.error);
      if (message) onError(message);
    };

    current.onend = () => {
      if (!isCurrent()) return;
      recognition = null;
      renderIdle();
      if (!receivedTranscript && !stopRequested) onError(describeVoiceError(undefined));
    };

    try {
      current.start();
    } catch {
      if (!isCurrent()) return;
      recognition = null;
      renderIdle();
      onError(describeVoiceError(undefined));
    }
  };

  micBtn.addEventListener('click', () => {
    if (recognition) {
      stopRequested = true;
      recognition.stop();
      return;
    }
    if (pendingStart) {
      reset();
      return;
    }
    const expectedGeneration = ++generation;
    pendingStart = true;
    void (async () => {
      const permission = await microphonePermission();
      if (generation !== expectedGeneration) return;
      if (permission === 'denied') {
        pendingStart = false;
        onError(t('spVoiceMicBlocked'));
        return;
      }
      const acknowledged = permission === 'granted' || (await microphoneNoticeAcknowledged());
      if (generation !== expectedGeneration) return;
      if (acknowledged) {
        startListening(expectedGeneration);
        return;
      }
      pendingStart = false;
      notice.ask(() => startListening(expectedGeneration), micBtn);
    })();
  });
  return { reset };
}
