import { setChild } from '../../dom-helpers';
import { Mic, renderIcon } from '../../assets/icons';

const VOICE_IDLE_TITLE = "Voice input (audio is transcribed by Chrome's speech service)";

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

const VOICE_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed':
    'Microphone access is blocked. Allow the microphone for AGI in Chrome site settings, then try again.',
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

export function setupVoiceInput(
  micBtn: HTMLButtonElement,
  inputEl: HTMLTextAreaElement,
  autoResize: (el: HTMLTextAreaElement) => void,
  onError: (message: string) => void = () => {},
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
  micBtn.title = VOICE_IDLE_TITLE;

  let recognition: InstanceType<SpeechRecognitionCtor> | null = null;
  let listening = false;

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition?.stop();
      return;
    }

    recognition = new SpeechRecognitionCtor();
    recognition.lang = chrome.i18n?.getUILanguage?.() || navigator.language || 'en-US';
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
        micBtn.title = VOICE_IDLE_TITLE;
      }
      recognition = null;
    };

    recognition.start();
  });
}
