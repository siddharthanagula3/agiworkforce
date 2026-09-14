import { setChild } from '../../dom-helpers';
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
  onerror: (() => void) | null;
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
};

/** What the mic button says it will transcribe, so the choice is visible. */
export function micTooltip(language: string | null): string {
  return language ? `Voice input · ${languageLabel(language)}` : 'Voice input';
}

export function setupVoiceInput(
  micBtn: HTMLButtonElement,
  inputEl: HTMLTextAreaElement,
  autoResize: (el: HTMLTextAreaElement) => void,
): void {
  const w = window as unknown as Record<string, unknown>;
  const SpeechRecognitionCtor: SpeechRecognitionCtor | undefined =
    (w['SpeechRecognition'] as SpeechRecognitionCtor | undefined) ??
    (w['webkitSpeechRecognition'] as SpeechRecognitionCtor | undefined);

  if (!SpeechRecognitionCtor) {
    micBtn.title = 'Voice input not supported in this browser';
    micBtn.style.opacity = '0.4';
    micBtn.style.cursor = 'not-allowed';
    return;
  }

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

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition?.stop();
      return;
    }

    recognition = new SpeechRecognitionCtor();
    // Left at the browser's own default when this profile names no language,
    // rather than pinning a locale the user never chose.
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

    recognition.onerror = () => {
      /* ignore */
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
  });
}
