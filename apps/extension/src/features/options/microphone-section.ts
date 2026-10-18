import { t } from '../../i18n';
import { el } from '../side-panel/dom';

export type MicrophoneAccess = 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported';

export interface MicrophoneEnvironment {
  permissions?: Pick<Permissions, 'query'>;
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
}

function browserEnvironment(): MicrophoneEnvironment {
  return {
    ...(typeof navigator.permissions?.query === 'function'
      ? { permissions: navigator.permissions }
      : {}),
    ...(typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? { mediaDevices: navigator.mediaDevices }
      : {}),
  };
}

export async function readMicrophoneAccess(
  environment: MicrophoneEnvironment = browserEnvironment(),
): Promise<MicrophoneAccess> {
  if (!environment.mediaDevices) return 'unsupported';
  if (!environment.permissions) return 'unknown';
  try {
    const status = await environment.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export async function requestMicrophoneAccess(
  environment: MicrophoneEnvironment = browserEnvironment(),
): Promise<MicrophoneAccess> {
  if (!environment.mediaDevices) return 'unsupported';
  try {
    const stream = await environment.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (cause) {
    const name = cause instanceof DOMException || cause instanceof Error ? cause.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    return 'unknown';
  }
}

function describeAccess(access: MicrophoneAccess): string {
  switch (access) {
    case 'granted':
      return t('optMicrophoneGranted');
    case 'denied':
      return t('optMicrophoneDenied');
    case 'prompt':
      return t('optMicrophonePrompt');
    case 'unsupported':
      return t('optMicrophoneUnsupported');
    default:
      return t('optMicrophoneUnknown');
  }
}

export interface MicrophoneRow {
  element: HTMLElement;
  button: HTMLButtonElement;
  status: HTMLElement;
  loaded: Promise<void>;
}

export function createMicrophoneRow(
  environment: MicrophoneEnvironment = browserEnvironment(),
): MicrophoneRow {
  const element = el('div', { class: 'opt-row', id: 'opt-microphone-row' });
  const text = el('div');
  text.appendChild(
    el('div', { class: 'opt-row-label', id: 'opt-microphone-label' }, t('optMicrophoneTitle')),
  );
  text.appendChild(el('div', { class: 'opt-row-hint' }, t('optMicrophoneHint')));
  const status = el('div', {
    class: 'opt-row-hint',
    id: 'opt-microphone-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  text.appendChild(status);

  const button = el(
    'button',
    {
      class: 'opt-btn-secondary',
      id: 'opt-microphone-btn',
      type: 'button',
      'aria-describedby': 'opt-microphone-status',
    },
    t('optMicrophoneAllow'),
  );

  const apply = (access: MicrophoneAccess): void => {
    status.textContent = describeAccess(access);
    button.hidden = access === 'granted';
    button.disabled = access === 'unsupported' || access === 'denied';
  };

  button.addEventListener('click', () => {
    button.disabled = true;
    void requestMicrophoneAccess(environment).then(apply);
  });

  element.append(text, button);
  const loaded = readMicrophoneAccess(environment).then(apply);
  return { element, button, status, loaded };
}
