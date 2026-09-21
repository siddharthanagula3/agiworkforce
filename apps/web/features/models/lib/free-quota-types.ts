import type { ProviderOfferingCategory } from '@agiworkforce/types';

export type FreeQuotaStatus = 'ready' | 'exhausted' | 'expired' | 'unavailable';

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
  issuer: string;
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
  ready: 'Free quota available',
  exhausted: 'Free quota exhausted · Choose another model',
  expired: 'Quota expired',
  unavailable: 'Not available right now',
};

export const FREE_QUOTA_EXHAUSTED_CODE = 'free_quota_exhausted';
