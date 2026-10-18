/**
 * The Free plan notices the web chat shows, in the side panel: the training
 * notice and the free model promotion. Each is shown the first time an account
 * meets it in this Chrome profile and recorded at once, so it is not shown on
 * every visit until dismissed; another account still sees it once, and signing
 * out does not bring it back.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getPickerModels } from '@agiworkforce/types';
import {
  FREE_PLAN_TRAINING_CHAT_NOTICE_LEAD,
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL,
  FREE_PLAN_TRAINING_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_NOTICE_TITLE,
  freeModelPromotionHeadline,
} from '@agiworkforce/compliance';
import { agiWebUrl } from '../src/lib/webOrigin';

type ClerkAuthModule = typeof import('../src/features/cloud-bridge/clerkAuth');

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ClerkAuthModule>()),
  getFreshClerkToken: () => Promise.resolve(null),
  getFreshClerkAuthContext: () => Promise.resolve(null),
  revokeSyncedWebSession: () => Promise.resolve(),
  signOutClerk: () => Promise.resolve(),
}));

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const catalog = JSON.parse(
  readFileSync(join(APP_ROOT, '_locales', 'en', 'messages.json'), 'utf8'),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

const local: Record<string, unknown> = {};

function area(bucket: Record<string, unknown>) {
  return {
    get: (keys: string | string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        if (key in bucket) result[key] = bucket[key];
      }
      return Promise.resolve(result);
    },
    set: (items: Record<string, unknown>) => {
      Object.assign(bucket, structuredClone(items));
      return Promise.resolve();
    },
    remove: (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete bucket[key];
      return Promise.resolve();
    },
  };
}

vi.stubGlobal('chrome', {
  i18n: { getMessage, getUILanguage: () => 'en' },
  runtime: { lastError: null, sendMessage: () => Promise.resolve(undefined) },
  storage: { local: area(local), session: area({}), sync: area({}) },
});

const { claimFirstShowing, chromeNoticeStore } =
  await import('../src/features/side-panel/shownOnceNotice');
const {
  buildFreePlanNotices,
  FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY,
  FREE_MODEL_PROMOTION_NOTICE_STORAGE_PREFIX,
} = await import('../src/features/side-panel/freePlanNotices');
const { signOutOfAccount } = await import('../src/features/cloud-bridge/freeTrialClient');

type FreeModelPromotionOffer = import('@agiworkforce/cloud-contracts').FreeModelPromotionOffer;

const NOW = Date.parse('2026-10-17T12:00:00.000Z');
const PROMOTED = getPickerModels()[0]!.id;
const PROMOTED_NAME = getModelMetadataById(PROMOTED)!.name;
const RUNNING_OFFER: FreeModelPromotionOffer = {
  modelId: PROMOTED,
  endsAt: '2026-10-25T00:00:00.000Z',
};

function freeAccount(accountId = 'user_a', subscriptionTier = 'free') {
  return { accountId, subscriptionTier, token: `token-${accountId}` };
}

function panel(offer: FreeModelPromotionOffer | null = null) {
  const fetchPromotion = vi.fn(async () => offer);
  const notices = buildFreePlanNotices({ fetchPromotion, now: () => NOW });
  document.body.replaceChildren(notices.element);
  const training = () =>
    notices.element.querySelector<HTMLElement>('[data-testid="free-plan-training-notice"]')!;
  const promotion = () =>
    notices.element.querySelector<HTMLElement>('[data-testid="free-model-promotion-notice"]')!;
  return {
    notices,
    fetchPromotion,
    trainingVisible: () => training().classList.contains('visible'),
    promotionVisible: () => promotion().classList.contains('visible'),
    training,
    promotion,
  };
}

beforeEach(() => {
  for (const key of Object.keys(local)) delete local[key];
});

describe('shown once per account', () => {
  it('is shown the first time and recorded at once, without a dismissal', async () => {
    expect(await claimFirstShowing(chromeNoticeStore, 'agi.notice.test', 'user_a')).toBe(true);
    expect(await claimFirstShowing(chromeNoticeStore, 'agi.notice.test', 'user_a')).toBe(false);
  });

  it('lists every account it was shown to, however they alternate', async () => {
    expect(await claimFirstShowing(chromeNoticeStore, 'agi.notice.test', 'user_a')).toBe(true);
    expect(await claimFirstShowing(chromeNoticeStore, 'agi.notice.test', 'user_b')).toBe(true);
    expect(await claimFirstShowing(chromeNoticeStore, 'agi.notice.test', 'user_a')).toBe(false);
    expect(await claimFirstShowing(chromeNoticeStore, 'agi.notice.test', 'user_b')).toBe(false);
    expect(local['agi.notice.test']).toHaveLength(2);
  });

  it('keeps a fingerprint, so the stored value does not name the account', async () => {
    await claimFirstShowing(chromeNoticeStore, 'agi.notice.test', 'user_private_id');

    expect(JSON.stringify(local['agi.notice.test'])).not.toContain('user_private_id');
  });

  it('shows the notice again when storage cannot be read or written', async () => {
    const broken = {
      get: () => Promise.reject(new Error('blocked')),
      set: () => Promise.reject(new Error('blocked')),
    };
    expect(await claimFirstShowing(broken, 'agi.notice.test', 'user_a')).toBe(true);
    expect(await claimFirstShowing(broken, 'agi.notice.test', 'user_a')).toBe(true);
  });

  it('survives sign-out', async () => {
    await claimFirstShowing(chromeNoticeStore, FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY, 'user_a');
    const before = structuredClone(local[FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY]);

    await signOutOfAccount();

    expect(local[FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY]).toEqual(before);
    expect(
      await claimFirstShowing(chromeNoticeStore, FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY, 'user_a'),
    ).toBe(false);
  });
});

describe('the Free plan training notice', () => {
  it('shows once to a Free account and stays up for the rest of that visit', async () => {
    const first = panel();
    await first.notices.update(freeAccount());
    expect(first.trainingVisible()).toBe(true);
    expect(first.training().getAttribute('role')).toBe('note');

    await first.notices.update(freeAccount());
    expect(first.trainingVisible()).toBe(true);

    const reopened = panel();
    await reopened.notices.update(freeAccount());
    expect(reopened.trainingVisible()).toBe(false);
  });

  it('shows once to another account on the same profile', async () => {
    await panel().notices.update(freeAccount('user_a'));
    const second = panel();
    await second.notices.update(freeAccount('user_b'));
    expect(second.trainingVisible()).toBe(true);
  });

  it('is not shown to, or recorded for, a paid account or a signed-out panel', async () => {
    const paid = panel();
    await paid.notices.update(freeAccount('user_a', 'pro'));
    expect(paid.trainingVisible()).toBe(false);
    await paid.notices.update(null);
    expect(paid.trainingVisible()).toBe(false);
    expect(local[FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY]).toBeUndefined();
  });

  it('hides on sign-out and stays gone when the account signs back in', async () => {
    const visit = panel();
    await visit.notices.update(freeAccount());
    await visit.notices.update(null);
    expect(visit.trainingVisible()).toBe(false);
    await visit.notices.update(freeAccount());
    expect(visit.trainingVisible()).toBe(false);
  });

  it('closes on its dismiss button', async () => {
    const visit = panel();
    await visit.notices.update(freeAccount());
    visit.training().querySelector<HTMLButtonElement>('button')!.click();
    expect(visit.trainingVisible()).toBe(false);
  });

  it('uses the shared copy and links to the web privacy settings and data use page', async () => {
    const visit = panel();
    await visit.notices.update(freeAccount());
    const text = visit.training().textContent ?? '';

    expect(text).toContain(
      `${FREE_PLAN_TRAINING_CHAT_NOTICE_LEAD} ${FREE_PLAN_TRAINING_DATA_DISCLOSURE}`,
    );
    expect(text).not.toContain('Settings > Privacy');
    const links = [...visit.training().querySelectorAll<HTMLAnchorElement>('a')];
    expect(links.map((link) => link.textContent)).toEqual([
      'Opt out in your account’s privacy settings.',
      FREE_PLAN_TRAINING_NOTICE_LINK_LABEL,
    ]);
    expect(links.map((link) => new URL(link.href).origin)).toEqual([
      new URL(agiWebUrl('/')).origin,
      new URL(agiWebUrl('/')).origin,
    ]);
    expect(links.map((link) => new URL(link.href).pathname)).toEqual([
      '/settings/privacy',
      '/data-use',
    ]);
    expect(visit.training().getAttribute('aria-label')).toBe(FREE_PLAN_TRAINING_NOTICE_TITLE);
    expect(visit.training().querySelector('button')!.getAttribute('aria-label')).toBe(
      FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL,
    );
  });
});

describe('the free model promotion notice', () => {
  it('names the promoted model from the catalog, once per account', async () => {
    const first = panel(RUNNING_OFFER);
    await first.notices.update(freeAccount());
    expect(first.promotionVisible()).toBe(true);
    expect(first.promotion().textContent).toBe(freeModelPromotionHeadline(PROMOTED_NAME));
    expect(first.promotion().textContent?.toLowerCase()).not.toMatch(/unlimited|usage|remaining/);
    expect(
      local[`${FREE_MODEL_PROMOTION_NOTICE_STORAGE_PREFIX}.${PROMOTED}.${RUNNING_OFFER.endsAt}`],
    ).toHaveLength(1);

    const reopened = panel(RUNNING_OFFER);
    await reopened.notices.update(freeAccount());
    expect(reopened.promotionVisible()).toBe(false);

    const other = panel(RUNNING_OFFER);
    await other.notices.update(freeAccount('user_b'));
    expect(other.promotionVisible()).toBe(true);
  });

  it('is shown again for a new promotion', async () => {
    await panel(RUNNING_OFFER).notices.update(freeAccount());
    const next = panel({ ...RUNNING_OFFER, endsAt: '2026-11-25T00:00:00.000Z' });
    await next.notices.update(freeAccount());
    expect(next.promotionVisible()).toBe(true);
  });

  it('is not shown when there is no offer, it has ended, or the model is unknown', async () => {
    for (const offer of [
      null,
      { ...RUNNING_OFFER, endsAt: '2026-10-01T00:00:00.000Z' },
      { ...RUNNING_OFFER, modelId: 'not-a-model' },
    ]) {
      const visit = panel(offer);
      await visit.notices.update(freeAccount());
      expect(visit.promotionVisible()).toBe(false);
    }
    expect(
      Object.keys(local).some((key) => key.startsWith(FREE_MODEL_PROMOTION_NOTICE_STORAGE_PREFIX)),
    ).toBe(false);
  });

  it('does not ask for the offer on a paid plan', async () => {
    const paid = panel(RUNNING_OFFER);
    await paid.notices.update(freeAccount('user_a', 'max'));
    expect(paid.fetchPromotion).not.toHaveBeenCalled();
    expect(paid.promotionVisible()).toBe(false);
  });
});
