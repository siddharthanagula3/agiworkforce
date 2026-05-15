import { setText, setChild } from '../dom-helpers';

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

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition?.stop();
      return;
    }

    recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
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
      }
    };

    recognition.onerror = () => {
      /* ignore */
    };

    recognition.onend = () => {
      listening = false;
      // Memory-leak guard: only update DOM if document is still active
      if (document.body) {
        micBtn.classList.remove('active');
        setText(micBtn, '🎤');
        micBtn.title = 'Voice input';
      }
      recognition = null;
    };

    recognition.start();
  });
}
