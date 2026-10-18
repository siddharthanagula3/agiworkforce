import { t } from '../../i18n';
import { el } from './dom';
import {
  WELCOME_PAGE_PATH,
  dismissPinPrompt,
  onboardingPromptKind,
  type OnboardingPromptKind,
} from './onboarding';

export interface OnboardingPrompt {
  element: HTMLElement;
  shown: Promise<OnboardingPromptKind | null>;
}

export interface OnboardingPromptDependencies {
  kind(): Promise<OnboardingPromptKind | null>;
  openWelcome(): void;
  dismissPin(): void;
}

function browserDependencies(): OnboardingPromptDependencies {
  return {
    kind: () => onboardingPromptKind(),
    openWelcome: () => {
      void chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE_PATH) });
    },
    dismissPin: dismissPinPrompt,
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
    if (element.dataset['kind'] === 'pin') dependencies.dismissPin();
    close();
  });
  action.addEventListener('click', () => {
    if (element.dataset['kind'] === 'review') dependencies.openWelcome();
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
      if (kind === 'review') {
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
