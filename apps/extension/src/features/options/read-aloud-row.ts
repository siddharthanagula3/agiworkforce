import { t } from '../../i18n';
import {
  DEFAULT_READ_ALOUD_SETTINGS,
  READ_ALOUD_RATES,
  READ_ALOUD_STORAGE_KEY,
  isReadAloudSupported,
  parseReadAloudSettings,
  speakAloud,
  stopSpeaking,
  type ReadAloudSettings,
} from '../read-aloud';
import { el } from '../side-panel/dom';

export interface ReadAloudStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface ReadAloudRow {
  element: HTMLElement;
  voiceSelect: HTMLSelectElement;
  rateSelect: HTMLSelectElement;
  previewButton: HTMLButtonElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

export function createReadAloudRow(
  storage: ReadAloudStorage,
  synth: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): ReadAloudRow {
  const element = el('div', { class: 'opt-row opt-read-aloud', id: 'opt-read-aloud-row' });
  const text = el('div');
  text.appendChild(
    el('div', { class: 'opt-row-label', id: 'opt-read-aloud-label' }, t('optReadAloudTitle')),
  );
  text.appendChild(el('div', { class: 'opt-row-hint' }, t('optReadAloudHint')));
  const status = el('div', {
    class: 'opt-row-hint',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  text.appendChild(status);

  const controls = el('div', { class: 'opt-read-aloud-controls' });
  const voiceSelect = el('select', {
    class: 'opt-policy-select',
    id: 'opt-read-aloud-voice',
    'aria-label': t('optReadAloudVoice'),
  });
  const rateSelect = el('select', {
    class: 'opt-policy-select',
    id: 'opt-read-aloud-rate',
    'aria-label': t('optReadAloudRate'),
  });
  for (const rate of READ_ALOUD_RATES) {
    rateSelect.appendChild(el('option', { value: String(rate) }, `${rate}×`));
  }
  const previewButton = el(
    'button',
    { class: 'opt-btn-secondary', id: 'opt-read-aloud-preview', type: 'button' },
    t('optReadAloudPreview'),
  );
  controls.append(voiceSelect, rateSelect, previewButton);
  element.append(text, controls);

  const supported = synth !== undefined && isReadAloudSupported({ speechSynthesis: synth });
  if (!supported || !synth) {
    status.textContent = t('optReadAloudUnsupported');
    voiceSelect.disabled = true;
    rateSelect.disabled = true;
    previewButton.disabled = true;
    return { element, voiceSelect, rateSelect, previewButton, status, loaded: Promise.resolve() };
  }

  let current: ReadAloudSettings = DEFAULT_READ_ALOUD_SETTINGS;

  const renderVoices = (): void => {
    voiceSelect.replaceChildren(el('option', { value: '' }, t('optReadAloudVoiceDefault')));
    for (const voice of synth.getVoices()) {
      voiceSelect.appendChild(
        el('option', { value: voice.voiceURI }, `${voice.name} (${voice.lang})`),
      );
    }
    voiceSelect.value = current.voiceURI ?? '';
    if (voiceSelect.value !== (current.voiceURI ?? '')) voiceSelect.value = '';
  };
  synth.addEventListener?.('voiceschanged', renderVoices);

  const save = (next: ReadAloudSettings): void => {
    const previous = current;
    current = next;
    status.textContent = t('optSaving');
    void storage
      .set({ [READ_ALOUD_STORAGE_KEY]: next })
      .then(() => {
        status.textContent = '';
      })
      .catch(() => {
        current = previous;
        voiceSelect.value = previous.voiceURI ?? '';
        rateSelect.value = String(previous.rate);
        status.textContent = t('optSaveFailed');
      });
  };

  voiceSelect.addEventListener('change', () => {
    save({ ...current, voiceURI: voiceSelect.value || null });
  });
  rateSelect.addEventListener('change', () => {
    save({ ...current, rate: Number(rateSelect.value) });
  });

  let previewing = false;
  previewButton.addEventListener('click', () => {
    if (previewing) {
      stopSpeaking(synth);
      previewing = false;
      previewButton.textContent = t('optReadAloudPreview');
      return;
    }
    const started = speakAloud(t('optReadAloudSample'), current, synth, () => {
      previewing = false;
      previewButton.textContent = t('optReadAloudPreview');
    });
    if (!started) return;
    previewing = true;
    previewButton.textContent = t('optReadAloudStop');
  });

  const loaded = storage
    .get(READ_ALOUD_STORAGE_KEY)
    .then((items) => parseReadAloudSettings(items[READ_ALOUD_STORAGE_KEY]))
    .catch(() => DEFAULT_READ_ALOUD_SETTINGS)
    .then((settings) => {
      current = settings;
      renderVoices();
      rateSelect.value = String(settings.rate);
    });

  return { element, voiceSelect, rateSelect, previewButton, status, loaded };
}
