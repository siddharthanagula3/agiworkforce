import type { ProviderOfferingCategory } from '@agiworkforce/types';
import type { FreeQuotaStatus } from '@agiworkforce/cloud-contracts';

export {
  FREE_QUOTA_EXHAUSTED_CODE,
  type FreeQuotaCatalogue,
  type FreeQuotaModel,
  type FreeQuotaStatus,
} from '@agiworkforce/cloud-contracts';

export const FREE_QUOTA_CATEGORIES: Readonly<Record<ProviderOfferingCategory, string>> = {
  chat: 'Text chat',
  image: 'Images',
  video: 'Video',
  audio: 'Audio & speech',
  embedding: 'Embeddings & ranking',
};

export const FREE_QUOTA_STATUS_LABELS: Readonly<Record<FreeQuotaStatus, string>> = {
  ready: 'Free quota available',
  exhausted: 'Free allowance used up',
  expired: 'Free offer ended',
  unavailable: 'Not available right now',
};
