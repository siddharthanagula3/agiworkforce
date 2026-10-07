import type { FreeQuotaMediaOffer } from '@agiworkforce/cloud-contracts';
import { FREE_MEDIA_LIMITED_LABEL } from '@/features/models/lib/free-media-offer';
import type { FlagshipAnnouncement } from './FlagshipSections';

const FREE_MEDIA_TERMS_HREF = '/pricing';

const FREE_MEDIA_ANNOUNCEMENT_LABEL = {
  both: 'Free image and video',
  image: 'Free image generation',
  video: 'Free video generation',
} as const;

export function landingAnnouncement(
  offer: FreeQuotaMediaOffer | null,
  standing: FlagshipAnnouncement,
): FlagshipAnnouncement {
  if (!offer || (!offer.image && !offer.video)) return standing;
  const kind = offer.image && offer.video ? 'both' : offer.image ? 'image' : 'video';
  return {
    tag: FREE_MEDIA_LIMITED_LABEL,
    label: FREE_MEDIA_ANNOUNCEMENT_LABEL[kind],
    href: FREE_MEDIA_TERMS_HREF,
  };
}
