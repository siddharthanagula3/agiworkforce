import { startDictationCapture, type DictationCapture } from './dictation';
import { SUPPORTED_LANGUAGES } from '@agiworkforce/i18n/languages';

const record = document.querySelector<HTMLButtonElement>('#record')!;
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!;
const status = document.querySelector<HTMLElement>('#status')!;
const language = document.querySelector<HTMLSelectElement>('#language')!;
for (const option of [...SUPPORTED_LANGUAGES].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
  const label =
    option.name === option.nativeName ? option.name : `${option.nativeName} (${option.name})`;
  language.add(new Option(label, option.code));
}
language.value = language.dataset['preferredLanguage'] ?? '';
let capture: DictationCapture | undefined;
let ended = false;

function close(message: string) {
  ended = true;
  clearInterval(check);
  capture?.cancel();
  record.disabled = true;
  cancel.disabled = true;
  language.disabled = true;
  status.textContent = message;
}

const check = setInterval(() => {
  void fetch(location.href, { method: 'HEAD' }).then(
    (response) => {
      if (!response.ok && !ended) close('This dictation session ended. Return to VS Code.');
    },
    () => {
      if (!ended) close('This dictation session ended. Return to VS Code.');
    },
  );
}, 2_000);

function reportError(message: string) {
  if (ended) return;
  capture = undefined;
  record.disabled = false;
  language.disabled = false;
  record.textContent = 'Start recording';
  status.textContent = message;
}

record.onclick = async () => {
  record.disabled = true;
  if (capture) {
    capture.finish();
    return;
  }
  const spokenLanguage = language.value || undefined;
  language.disabled = true;
  try {
    const next = await startDictationCapture(async (mimeType, base64) => {
      if (ended) return;
      clearInterval(check);
      record.disabled = true;
      status.textContent = 'Sending recording to VS Code…';
      try {
        const result = await fetch(location.href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType, base64, language: spokenLanguage }),
        });
        if (ended) return;
        if (!result.ok) throw new Error('Recording rejected.');
        close('Recording sent. Return to your draft in VS Code.');
      } catch {
        if (!ended) close('Could not send the recording. Start dictation again from VS Code.');
      }
    }, reportError);
    if (ended) {
      next.cancel();
      return;
    }
    capture = next;
    record.disabled = false;
    record.textContent = 'Stop and transcribe';
    status.textContent = 'Recording…';
  } catch (error) {
    reportError(
      error instanceof Error && error.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser to try again.'
        : 'Could not start the microphone.',
    );
  }
};
cancel.onclick = () => {
  close('Recording cancelled. Return to VS Code.');
  void fetch(location.href, { method: 'DELETE', keepalive: true }).catch(() => {});
};
window.addEventListener('pagehide', () => {
  if (!ended) cancel.click();
});
