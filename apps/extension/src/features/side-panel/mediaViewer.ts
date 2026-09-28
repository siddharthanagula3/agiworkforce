import { renderIcon, X } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';

let closeOpenViewer: (() => void) | null = null;

export function openImageViewer(src: string, alt: string, trigger?: HTMLElement | null): void {
  closeOpenViewer?.();
  const overlay = el('div', {
    class: 'sp-media-viewer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': alt,
  });
  const close = el(
    'button',
    { class: 'sp-media-viewer__close', type: 'button', 'aria-label': t('spMediaViewerClose') },
    renderIcon(X, 18),
  );
  overlay.appendChild(close);
  overlay.appendChild(el('img', { class: 'sp-media-viewer__image', src, alt }));

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      close.focus();
    }
  };
  const dismiss = (): void => {
    if (closeOpenViewer !== dismiss) return;
    closeOpenViewer = null;
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    if (trigger?.isConnected) trigger.focus();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) dismiss();
  });
  close.addEventListener('click', dismiss);
  document.addEventListener('keydown', onKeyDown, true);
  closeOpenViewer = dismiss;
  document.body.appendChild(overlay);
  close.focus();
}

export function buildImageViewerButton(
  image: HTMLImageElement,
  className: string,
): HTMLButtonElement {
  const button = el(
    'button',
    {
      class: className,
      type: 'button',
      'aria-label': t('spMediaViewerOpen', [image.alt]),
    },
    image,
  );
  button.addEventListener('click', () => openImageViewer(image.src, image.alt, button));
  return button;
}
