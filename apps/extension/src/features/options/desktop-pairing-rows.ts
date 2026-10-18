import { t } from '../../i18n';
import {
  beginPairing,
  loadPairingState,
  submitPairingCode,
  unpair,
  type PairingState,
} from '../native-bridge/pairing';
import { el } from '../side-panel/dom';

export interface PairingApi {
  beginPairing(): Promise<PairingState>;
  loadPairingState(): Promise<PairingState>;
  submitPairingCode(code: string): Promise<PairingState>;
  unpair(): Promise<PairingState>;
}

export interface DesktopPairingRows {
  element: HTMLElement;
  loaded: Promise<void>;
}

const browserPairing: PairingApi = { beginPairing, loadPairingState, submitPairingCode, unpair };

export function createDesktopPairingRows(api: PairingApi = browserPairing): DesktopPairingRows {
  const element = el('div', { id: 'opt-pairing' });

  const stateRow = el('div', { class: 'opt-row' });
  const stateText = el('div');
  stateText.appendChild(el('div', { class: 'opt-row-label' }, t('spMenuPairing')));
  const label = el('div', {
    class: 'opt-row-hint',
    id: 'opt-pairing-label',
    role: 'status',
    'aria-live': 'polite',
  });
  const fingerprint = el('div', { class: 'opt-row-hint', id: 'opt-pairing-fingerprint' });
  fingerprint.hidden = true;
  const error = el('div', {
    class: 'opt-save-status error',
    id: 'opt-pairing-error',
    role: 'alert',
  });
  stateText.append(label, fingerprint, error);

  const pair = el('button', { class: 'opt-btn-primary', id: 'opt-pair-btn', type: 'button' });
  const unpairButton = el(
    'button',
    { class: 'opt-btn-danger', id: 'opt-unpair-btn', type: 'button' },
    t('optPairingUnpair'),
  );
  unpairButton.hidden = true;
  const stateActions = el('div', { class: 'opt-row-side' }, pair, unpairButton);
  stateRow.append(stateText, stateActions);

  const codeRow = el('div', { class: 'opt-row', id: 'opt-pairing-code-row' });
  codeRow.hidden = true;
  const codeText = el('div');
  codeText.appendChild(
    el('label', { class: 'opt-row-label', for: 'opt-pairing-code' }, t('spPairingCodeHint')),
  );
  const code = el('input', {
    type: 'text',
    id: 'opt-pairing-code',
    class: 'opt-pairing-code',
    placeholder: t('spPairingCodePlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: '12',
  });
  const codeSubmit = el(
    'button',
    { class: 'opt-btn-primary', type: 'button' },
    t('spPairingCodeSubmit'),
  );
  codeRow.append(codeText, el('div', { class: 'opt-row-side' }, code, codeSubmit));
  const confirmRow = el('div', {
    class: 'opt-row',
    id: 'opt-unpair-confirm',
    role: 'alertdialog',
    'aria-labelledby': 'opt-unpair-confirm-text',
  });
  confirmRow.hidden = true;
  const confirmUnpair = el(
    'button',
    { class: 'opt-btn-danger', id: 'opt-unpair-confirm-btn', type: 'button' },
    t('optPairingUnpair'),
  );
  const cancelUnpair = el(
    'button',
    { class: 'opt-btn-secondary', id: 'opt-unpair-cancel-btn', type: 'button' },
    t('optPairingUnpairCancel'),
  );
  confirmRow.append(
    el(
      'div',
      { class: 'opt-row-hint', id: 'opt-unpair-confirm-text' },
      t('optPairingUnpairConfirm'),
    ),
    el('div', { class: 'opt-row-side' }, cancelUnpair, confirmUnpair),
  );
  element.append(stateRow, confirmRow, codeRow);

  const apply = (state: PairingState): void => {
    error.textContent = '';
    const awaiting = state.phase === 'awaiting-code' || state.phase === 'confirming';
    codeRow.hidden = !awaiting;
    if (!awaiting) code.value = '';
    code.disabled = state.phase === 'confirming';
    codeSubmit.disabled = state.phase === 'confirming';
    fingerprint.hidden = state.phase !== 'paired' || !state.fingerprint;
    if (state.phase === 'paired' && state.fingerprint) fingerprint.textContent = state.fingerprint;
    pair.hidden = state.phase === 'paired' || awaiting;
    pair.disabled = state.phase === 'requesting';
    unpairButton.hidden = state.phase !== 'paired';
    if (state.phase !== 'paired') confirmRow.hidden = true;
    switch (state.phase) {
      case 'idle':
        label.textContent = t('spPairingIdle');
        pair.textContent = t('spPairingPair');
        break;
      case 'requesting':
        label.textContent = t('spPairingInProgress');
        pair.textContent = t('spPairingInProgress');
        break;
      case 'awaiting-code':
        label.textContent = t('spPairingAwaitingCode');
        break;
      case 'confirming':
        label.textContent = t('spPairingInProgress');
        break;
      case 'paired':
        label.textContent = t('spPairingPaired');
        break;
      case 'error':
        label.textContent = t('spPairingFailed');
        pair.textContent = t('spPairingRetry');
        break;
    }
    if ((state.phase === 'error' || state.phase === 'awaiting-code') && state.error) {
      error.textContent = state.error;
    }
  };

  pair.addEventListener('click', () => {
    apply({
      phase: 'requesting',
      fingerprint: null,
      error: null,
      requestId: null,
      codeLength: null,
      expiresAt: null,
    });
    void api.beginPairing().then(apply);
  });
  codeSubmit.addEventListener('click', () => {
    void api.submitPairingCode(code.value).then(apply);
  });
  code.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void api.submitPairingCode(code.value).then(apply);
  });
  unpairButton.addEventListener('click', () => {
    confirmRow.hidden = false;
    unpairButton.hidden = true;
    cancelUnpair.focus();
  });
  cancelUnpair.addEventListener('click', () => {
    confirmRow.hidden = true;
    unpairButton.hidden = false;
    unpairButton.focus();
  });
  confirmUnpair.addEventListener('click', () => {
    confirmUnpair.disabled = true;
    void api
      .unpair()
      .then(apply)
      .finally(() => {
        confirmUnpair.disabled = false;
        confirmRow.hidden = true;
      });
  });

  const loaded = api.loadPairingState().then(apply);
  return { element, loaded };
}
