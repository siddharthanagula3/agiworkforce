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
  decided: string | null;
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
      const offer = fetchPromotion(account.token).catch(() => {
        promotionRead = null;
        return null;
      });
      promotionRead = { accountId: account.accountId, offer };
    }
    return promotionRead.offer;
  };

  const decide = async (
    notice: ShownOnceNotice,
    storageKey: string | null,
    accountId: string | null,
  ): Promise<void> => {
    if (!storageKey || !accountId) {
      notice.decided = null;
      notice.element.classList.remove('visible');
      return;
    }
    const decision = `${storageKey} ${accountId}`;
    if (notice.decided === decision) return;
    notice.decided = decision;
    notice.element.classList.toggle(
      'visible',
      await claimFirstShowing(store, storageKey, accountId),
    );
  };

  const run = async (account: FreePlanNoticeAccount | null): Promise<void> => {
    const freeAccount =
      account && isFreeBillingPlanTier(normalizeBillingPlanTier(account.subscriptionTier))
        ? account
        : null;
    if (!freeAccount) promotionRead = null;
    await decide(
      training,
      freeAccount ? FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY : null,
      freeAccount?.accountId ?? null,
    );

    const offer = freeAccount ? await promotionFor(freeAccount) : null;
    const running = offer && Date.parse(offer.endsAt) > now() ? offer : null;
    const modelName = running ? getModelMetadataById(running.modelId)?.name : undefined;
    if (running && modelName) headline.textContent = freeModelPromotionHeadline(modelName);
    await decide(
      promotion,
      running && modelName ? promotionStorageKey(running) : null,
      freeAccount?.accountId ?? null,
    );
  };

  let queue: Promise<void> = Promise.resolve();
  const update = (account: FreePlanNoticeAccount | null): Promise<void> => {
    queue = queue.then(() => run(account)).catch(() => undefined);
    return queue;
  };

  return { element, update };
}
