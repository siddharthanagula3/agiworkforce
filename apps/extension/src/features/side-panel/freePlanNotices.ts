import type { FreeModelPromotionOffer } from '@agiworkforce/cloud-contracts';
import {
  FREE_MODEL_PROMOTION_DISMISS_LABEL,
  FREE_MODEL_PROMOTION_NOTICE_TITLE,
  FREE_PLAN_TRAINING_CHAT_NOTICE_LEAD,
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL,
  FREE_PLAN_TRAINING_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_NOTICE_TITLE,
  freeModelPromotionHeadline,
} from '@agiworkforce/compliance';
import {
  getModelMetadataById,
  isFreeBillingPlanTier,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';

import { ExternalLink, X, renderIcon } from '../../assets/icons';
import { t } from '../../i18n';
import { agiWebUrl } from '../../lib/webOrigin';
import { fetchFreeModelPromotion } from '../cloud-bridge/freeModelPromotionClient';
import { el } from './dom';
import { chromeNoticeStore, claimFirstShowing, type NoticeStore } from './shownOnceNotice';

export const FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY = 'agi.notice.free-plan-training';
export const FREE_MODEL_PROMOTION_NOTICE_STORAGE_PREFIX = 'agi.notice.free-model-promotion';
const PRIVACY_SETTINGS_PATH = '/settings/privacy';
const DATA_USE_PATH = '/data-use';

export interface FreePlanNoticeAccount {
  accountId: string;
  subscriptionTier: string;
  token: string;
}

export interface FreePlanNoticeDependencies {
  store?: NoticeStore;
  fetchPromotion?: (token: string) => Promise<FreeModelPromotionOffer | null>;
  now?: () => number;
}

export interface FreePlanNotices {
  element: HTMLElement;
  update(account: FreePlanNoticeAccount | null): Promise<void>;
}

interface ShownOnceNotice {
  element: HTMLElement;
  decided: { decision: string; shown: Promise<boolean>; applied: boolean } | null;
}

function buildNotice(
  testId: string,
  title: string,
  dismissLabel: string,
  ...content: (Node | string)[]
): ShownOnceNotice {
  const element = el('div', {
    class: 'sp-composer-notice',
    role: 'note',
    'aria-label': title,
    'data-testid': testId,
  });
  element.appendChild(el('span', {}, ...content));
  const dismiss = el('button', {
    class: 'sp-composer-notice-dismiss',
    type: 'button',
    'aria-label': dismissLabel,
  });
  dismiss.appendChild(renderIcon(X, 12));
  dismiss.addEventListener('click', () => element.classList.remove('visible'));
  element.appendChild(dismiss);
  return { element, decided: null };
}

function webLink(path: string, ...label: (Node | string)[]): HTMLAnchorElement {
  return el(
    'a',
    {
      class: 'sp-help-link',
      href: agiWebUrl(`${path}?from=chrome-extension`),
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    ...label,
  );
}

function promotionStorageKey(offer: FreeModelPromotionOffer): string {
  return `${FREE_MODEL_PROMOTION_NOTICE_STORAGE_PREFIX}.${offer.modelId}.${offer.endsAt}`;
}

export function buildFreePlanNotices(
  dependencies: FreePlanNoticeDependencies = {},
): FreePlanNotices {
  const store = dependencies.store ?? chromeNoticeStore;
  const fetchPromotion = dependencies.fetchPromotion ?? fetchFreeModelPromotion;
  const now = dependencies.now ?? Date.now;

  const training = buildNotice(
    'free-plan-training-notice',
    FREE_PLAN_TRAINING_NOTICE_TITLE,
    FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL,
    `${FREE_PLAN_TRAINING_CHAT_NOTICE_LEAD} ${FREE_PLAN_TRAINING_DATA_DISCLOSURE} `,
    webLink(PRIVACY_SETTINGS_PATH, t('spFreePlanTrainingNoticeOptOut')),
    ' ',
    webLink(DATA_USE_PATH, FREE_PLAN_TRAINING_NOTICE_LINK_LABEL, renderIcon(ExternalLink, 12)),
  );
  const headline = el('strong', {});
  const promotion = buildNotice(
    'free-model-promotion-notice',
    FREE_MODEL_PROMOTION_NOTICE_TITLE,
    FREE_MODEL_PROMOTION_DISMISS_LABEL,
    headline,
  );

  const element = el('div', { class: 'sp-free-plan-notices' }, training.element, promotion.element);

  let promotionRead: { accountId: string; offer: Promise<FreeModelPromotionOffer | null> } | null =
    null;
  const promotionFor = (
    account: FreePlanNoticeAccount,
  ): Promise<FreeModelPromotionOffer | null> => {
    if (promotionRead?.accountId !== account.accountId) {
      const offer: Promise<FreeModelPromotionOffer | null> = fetchPromotion(account.token).catch(
        () => {
          if (promotionRead?.offer === offer) promotionRead = null;
          return null;
        },
      );
      promotionRead = { accountId: account.accountId, offer };
    }
    return promotionRead.offer;
  };

  let generation = 0;
  let owner: string | null = null;
  let claims: Promise<unknown> = Promise.resolve();
  const claim = (storageKey: string, accountId: string): Promise<boolean> => {
    const next = claims.then(() => claimFirstShowing(store, storageKey, accountId));
    claims = next.catch(() => undefined);
    return next;
  };

  const retire = (): void => {
    for (const notice of [training, promotion]) {
      notice.decided = null;
      notice.element.classList.remove('visible');
    }
  };

  const decide = async (
    notice: ShownOnceNotice,
    storageKey: string | null,
    accountId: string | null,
    current: number,
  ): Promise<void> => {
    if (!storageKey || !accountId) {
      notice.decided = null;
      notice.element.classList.remove('visible');
      return;
    }
    const decision = `${storageKey} ${accountId}`;
    if (notice.decided?.decision !== decision) {
      notice.decided = { decision, shown: claim(storageKey, accountId), applied: false };
    }
    const decided = notice.decided;
    const shown = await decided.shown;
    if (current !== generation || decided.applied) return;
    decided.applied = true;
    notice.element.classList.toggle('visible', shown);
  };

  const run = async (freeAccount: FreePlanNoticeAccount, current: number): Promise<void> => {
    await decide(training, FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY, freeAccount.accountId, current);

    const offer = await promotionFor(freeAccount);
    if (current !== generation) return;
    const running = offer && Date.parse(offer.endsAt) > now() ? offer : null;
    const modelName = running ? getModelMetadataById(running.modelId)?.name : undefined;
    if (running && modelName) headline.textContent = freeModelPromotionHeadline(modelName);
    await decide(
      promotion,
      running && modelName ? promotionStorageKey(running) : null,
      freeAccount.accountId,
      current,
    );
  };

  const update = (account: FreePlanNoticeAccount | null): Promise<void> => {
    generation += 1;
    const freeAccount =
      account && isFreeBillingPlanTier(normalizeBillingPlanTier(account.subscriptionTier))
        ? account
        : null;
    const accountId = freeAccount?.accountId ?? null;
    if (accountId !== owner) {
      owner = accountId;
      retire();
    }
    if (!freeAccount) {
      promotionRead = null;
      return Promise.resolve();
    }
    return run(freeAccount, generation).catch(() => undefined);
  };

  return { element, update };
}
