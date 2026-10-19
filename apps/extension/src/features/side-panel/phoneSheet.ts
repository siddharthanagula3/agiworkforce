import { toString as renderQrSvg } from 'qrcode';
import { X, renderIcon } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';
import { wireSheetKeyboard } from './sheet';

export interface PhoneSheetDependencies {
  copy: (text: string) => Promise<void>;
}

export interface PhoneSheet {
  element: HTMLElement;
  open: (link: string, trigger: HTMLElement) => void;
  close: () => void;
}

export function buildPhoneSheet(dependencies: PhoneSheetDependencies): PhoneSheet {
  const sheet = el('div', {
    id: 'sp-phone',
    class: 'sp-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'sp-phone-title',
  });
  sheet.hidden = true;
  const header = el('div', { class: 'sp-sheet-header' });
  header.appendChild(
    el('h2', { id: 'sp-phone-title', class: 'sp-sheet-title' }, t('spPhoneTitle')),
  );
  const close = el('button', { class: 'sp-sheet-close', type: 'button' });
  close.setAttribute('aria-label', t('spPhoneClose'));
  close.appendChild(renderIcon(X, 14));
  header.appendChild(close);
  sheet.appendChild(header);
  sheet.appendChild(el('p', { class: 'sp-sheet-intro' }, t('spPhoneIntro')));

  const code = el('img', { class: 'sp-phone-code', alt: t('spPhoneCodeAlt') }) as HTMLImageElement;
  code.hidden = true;
  sheet.appendChild(code);
  const linkText = el('p', { class: 'sp-phone-link' });
  sheet.appendChild(linkText);
  const copyButton = el('button', { type: 'button', class: 'sp-phone-copy' }, t('spPhoneCopy'));
  sheet.appendChild(copyButton);
  const status = el('div', { class: 'sp-memory-status', role: 'status', 'aria-live': 'polite' });
  sheet.appendChild(status);

  let currentLink = '';
  let returnFocus: HTMLElement | null = null;
  let generation = 0;

  copyButton.addEventListener('click', () => {
    const link = currentLink;
    void dependencies.copy(link).then(
      () => {
        if (link === currentLink) status.textContent = t('spPhoneCopied');
      },
      () => {
        if (link === currentLink) status.textContent = t('spPhoneCopyFailed');
      },
    );
  });

  function closeSheet(): void {
    if (sheet.hidden) return;
    generation += 1;
    sheet.hidden = true;
    returnFocus?.focus();
    returnFocus = null;
  }

  close.addEventListener('click', closeSheet);
  wireSheetKeyboard(sheet, closeSheet);

  return {
    element: sheet,
    open(link, trigger) {
      const current = ++generation;
      currentLink = link;
      returnFocus = trigger;
      linkText.textContent = link;
      status.textContent = '';
      code.hidden = true;
      code.removeAttribute('src');
      sheet.hidden = false;
      copyButton.focus();
      renderQrSvg(link, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }).then(
        (svg) => {
          if (current !== generation) return;
          code.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          code.hidden = false;
        },
        () => {
          if (current === generation) status.textContent = t('spPhoneCodeFailed');
        },
      );
    },
    close: closeSheet,
  };
}
