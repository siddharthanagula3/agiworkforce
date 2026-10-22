import { t } from '../../i18n';
import { el } from './dom';
import {
  WELCOME_PAGE_PATH,
  boundShortcuts,
  dismissPinPrompt,
  finishSidePanelTour,
  onboardingPromptKind,
  type OnboardingPromptKind,
  type TourShortcuts,
} from './onboarding';

export interface OnboardingPrompt {
  element: HTMLElement;
  shown: Promise<OnboardingPromptKind | null>;
}

export interface OnboardingPromptDependencies {
  kind(): Promise<OnboardingPromptKind | null>;
  openWelcome(): void;
  dismissPin(): void;
  finishTour?(): void;
  shortcuts?(): Promise<TourShortcuts>;
}

function browserDependencies(): OnboardingPromptDependencies {
  return {
    kind: () => onboardingPromptKind(),
    openWelcome: () => {
      void chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE_PATH) });
    },
    dismissPin: dismissPinPrompt,
    finishTour: finishSidePanelTour,
    shortcuts: boundShortcuts,
  };
}

export function mountOnboardingPrompt(
  parent: HTMLElement,
  dependencies: OnboardingPromptDependencies = browserDependencies(),
): OnboardingPrompt {
  const element = el('div', {
    id: 'sp-onboarding-prompt',
    class: 'sp-composer-notice',
    role: 'note',
  });
  const text = el('span', {});
  const action = el('button', { class: 'sp-composer-notice-action', type: 'button' });
  const dismiss = el(
    'button',
    { class: 'sp-composer-notice-action', type: 'button' },
    t('obPinDismiss'),
  );
  element.append(text, action, dismiss);
  parent.prepend(element);

  const close = (): void => {
    element.classList.remove('visible');
  };
  dismiss.addEventListener('click', () => {
    const kind = element.dataset['kind'];
    if (kind === 'pin') dependencies.dismissPin();
    else if (kind === 'tour') dependencies.finishTour?.();
    close();
  });
  let tourStep = 0;
  const showTourStep = async (): Promise<void> => {
    action.textContent = tourStep === 0 ? t('obTourNext') : t('obTourFinish');
    if (tourStep === 0) {
      text.textContent = t('obTourTabsText');
      return;
    }
    const keys = await (dependencies.shortcuts?.() ?? Promise.resolve({ open: '', capture: '' }));
    text.textContent =
      keys.open && keys.capture
        ? t('obTourShortcutsText', [keys.open, keys.capture])
        : t('obTourShortcutsUnset');
  };
  action.addEventListener('click', () => {
    const kind = element.dataset['kind'];
    if (kind === 'tour') {
      if (tourStep === 0) {
        tourStep = 1;
        void showTourStep();
        return;
      }
      dependencies.finishTour?.();
    } else if (kind === 'review') dependencies.openWelcome();
    else dependencies.dismissPin();
    close();
  });
  element.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dismiss.click();
  });

  const shown = dependencies
    .kind()
    .catch(() => null)
    .then((kind) => {
      if (!kind) return null;
      element.dataset['kind'] = kind;
      if (kind === 'tour') {
        dismiss.hidden = true;
        element.setAttribute('aria-label', t('obTourLabel'));
        void showTourStep();
      } else if (kind === 'review') {
        text.textContent = t('obReviewText');
        action.textContent = t('obReviewAction');
        dismiss.hidden = true;
        element.setAttribute('aria-label', t('obReviewText'));
      } else {
        text.textContent = `${t('obPinTitle')}. ${t('obPinHint')}`;
        action.textContent = t('obPinDone');
        dismiss.hidden = false;
        element.setAttribute('aria-label', t('obPinTitle'));
      }
      element.classList.add('visible');
      return kind;
    });

  return { element, shown };
}
