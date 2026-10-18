import { t } from '../../i18n';
import { agiWebUrl } from '../../lib/webOrigin';
import { DATA_HANDLING_DISCLOSURES } from '../privacy/dataHandling';
import { el } from '../side-panel/dom';

export interface WelcomeDependencies {
  isSignedIn(): Promise<boolean>;
  signIn(): Promise<void>;
  isPinned(): Promise<boolean | null>;
  openSidePanel(): Promise<void>;
  openSettings(): void;
  acknowledge(): void;
}

export interface WelcomePage {
  element: HTMLElement;
  loaded: Promise<void>;
}

function card(id: string, title: string): { section: HTMLElement; body: HTMLElement } {
  const section = el('section', { class: 'wl-card', 'aria-labelledby': `${id}-title` });
  section.appendChild(el('h2', { class: 'wl-card-title', id: `${id}-title` }, title));
  const body = el('div', { class: 'wl-card-body' });
  section.appendChild(body);
  return { section, body };
}

function list(items: readonly string[]): HTMLElement {
  const ul = el('ul', { class: 'wl-list' });
  for (const item of items) ul.appendChild(el('li', {}, item));
  return ul;
}

export function buildWelcomePage(dependencies: WelcomeDependencies): WelcomePage {
  const element = el('main', { class: 'wl-page' });
  const header = el('header', { class: 'wl-header' });
  header.appendChild(el('h1', { class: 'wl-title' }, t('welcomeTitle')));
  header.appendChild(el('p', { class: 'wl-lead' }, t('welcomeLead')));
  element.appendChild(header);

  const signIn = card('wl-signin', t('welcomeSignInTitle'));
  const signInStatus = el('p', { class: 'wl-text', role: 'status', 'aria-live': 'polite' });
  const signInButton = el(
    'button',
    { class: 'wl-btn wl-btn-secondary', type: 'button' },
    t('welcomeSignInAction'),
  );
  signIn.body.append(
    el('p', { class: 'wl-text' }, t('welcomeSignInBody')),
    signInStatus,
    signInButton,
  );
  element.appendChild(signIn.section);

  const renderSignedIn = (signedIn: boolean): void => {
    signInButton.hidden = signedIn;
    signInStatus.textContent = signedIn ? t('welcomeSignedIn') : '';
  };
  signInButton.addEventListener('click', () => {
    signInButton.disabled = true;
    void dependencies
      .signIn()
      .then(() => {
        signInStatus.textContent = t('welcomeSignInOpened');
      })
      .catch(() => {
        signInStatus.textContent = t('welcomeSignInFailed');
      })
      .finally(() => {
        signInButton.disabled = false;
      });
  });
  window.addEventListener('focus', () => {
    void dependencies.isSignedIn().then(renderSignedIn);
  });

  const pin = card('wl-pin', t('welcomePinTitle'));
  const pinStatus = el('p', { class: 'wl-text', role: 'status', 'aria-live': 'polite' });
  pin.body.append(el('p', { class: 'wl-text' }, t('welcomePinBody')), pinStatus);
  element.appendChild(pin.section);

  const scope = el('div', { class: 'wl-columns' });
  const can = card('wl-can', t('welcomeCanTitle'));
  can.body.appendChild(list([t('welcomeCan1'), t('welcomeCan2'), t('welcomeCan3')]));
  const cannot = card('wl-cannot', t('welcomeCannotTitle'));
  cannot.body.appendChild(list([t('welcomeCannot1'), t('welcomeCannot2'), t('welcomeCannot3')]));
  scope.append(can.section, cannot.section);
  element.appendChild(scope);

  const data = card('wl-data', t('welcomeDataTitle'));
  const injection = el('p', { class: 'wl-text wl-warning' }, `${t('welcomeInjection')} `);
  injection.appendChild(
    el(
      'a',
      {
        class: 'wl-link',
        href: agiWebUrl('/security'),
        target: '_blank',
        rel: 'noreferrer noopener',
      },
      t('welcomeLearnMore'),
    ),
  );
  data.body.appendChild(injection);
  for (const disclosure of DATA_HANDLING_DISCLOSURES) {
    const details = el('details', { class: 'wl-details' });
    details.appendChild(el('summary', {}, disclosure.label));
    details.appendChild(el('p', { class: 'wl-text' }, disclosure.body));
    data.body.appendChild(details);
  }
  element.appendChild(data.section);

  const start = card('wl-start', t('welcomeTryTitle'));
  const startStatus = el('p', { class: 'wl-text', role: 'status', 'aria-live': 'polite' });
  const startButton = el(
    'button',
    { class: 'wl-btn wl-btn-primary', type: 'button' },
    t('welcomeTryAction'),
  );
  const settingsButton = el(
    'button',
    { class: 'wl-btn wl-btn-secondary', type: 'button' },
    t('welcomeSettings'),
  );
  start.body.append(
    el('p', { class: 'wl-text' }, t('welcomeTryBody')),
    startStatus,
    el('div', { class: 'wl-actions' }, startButton, settingsButton),
  );
  element.appendChild(start.section);

  startButton.addEventListener('click', () => {
    dependencies.acknowledge();
    startButton.disabled = true;
    void dependencies
      .openSidePanel()
      .then(() => {
        startStatus.textContent = t('welcomeReady');
      })
      .catch(() => {
        startStatus.textContent = t('welcomeTryFailed');
      })
      .finally(() => {
        startButton.disabled = false;
      });
  });
  settingsButton.addEventListener('click', () => dependencies.openSettings());

  const loaded = Promise.all([
    dependencies.isSignedIn().catch(() => false),
    dependencies.isPinned().catch(() => null),
  ]).then(([signedIn, pinned]) => {
    renderSignedIn(signedIn);
    pinStatus.textContent = pinned === true ? t('welcomePinned') : '';
  });

  return { element, loaded };
}
