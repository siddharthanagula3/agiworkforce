import type { ProviderOfferingCategory } from '@agiworkforce/types';

export type FreeQuotaStatus =
  | 'ready'
  | 'exhausted'
  | 'unresolved'
  | 'expired'
  | 'quota_only_off'
  | 'account_check_required'
  | 'integration_required';

export interface FreeQuotaModel {
  key: string;
  displayName: string;
  providerModelId: string | null;
  category: ProviderOfferingCategory;
  limit: number | null;
  unit: 'tokens' | 'images' | 'seconds' | 'chars' | 'calls' | null;
  consumedApproximate: number | null;
  expiresOn: string | null;
  status: FreeQuotaStatus;
}

export interface FreeQuotaCatalogue {
  observedOn: string;
  evidenceUrl: string;
  reportedEligible: number;
  reportedUnavailable: number;
  models: FreeQuotaModel[];
}

export const FREE_QUOTA_CATEGORIES: Readonly<Record<ProviderOfferingCategory, string>> = {
  chat: 'Chat & vision',
  image: 'Images',
  video: 'Video',
  audio: 'Audio & speech',
  embedding: 'Embeddings & ranking',
};

export const FREE_QUOTA_STATUS_LABELS: Readonly<Record<FreeQuotaStatus, string>> = {
  exhausted: 'Free quota exhausted · Choose another model',
  ready: 'Free quota available',
  unresolved: 'Full model ID needed',
  expired: 'Quota expired',
  quota_only_off: 'Quota-only protection is off',
  account_check_required: 'Verify account quota before testing',
  integration_required: 'Free-quota testing not connected yet',
};

export const FREE_QUOTA_EXHAUSTED_CODE = 'free_quota_exhausted';
export const FREE_QUOTA_EXHAUSTED_MESSAGE =
  'This model’s free quota has been exhausted. Choose another model in Free to continue.';
