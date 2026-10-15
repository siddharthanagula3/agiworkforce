import {
  chineseHqProviderDisplayName,
  isChineseHqProvider,
  type ChineseHqProviderId,
  type NamedProviderConsent,
} from './provider-jurisdiction';
import {
  NON_US_VENDOR_TRANSPORT_DEPLOYMENTS,
  nonUsVendorTransportDeployment,
} from './transport-residency';

export const NAMED_PROVIDER_NOTICE_PRIVACY_PATH = '/privacy';
export const NAMED_PROVIDER_NOTICE_PROVIDER_LIST_PATH = '/subprocessors';

export interface NamedProviderNoticeLink {
  readonly label: string;
  readonly href: string;
}

export interface NamedProviderNotice {
  readonly providerId: ChineseHqProviderId;
  readonly providerName: string;
  readonly title: string;
  readonly statements: readonly string[];
  readonly links: readonly NamedProviderNoticeLink[];
  readonly acceptLabel: string;
  readonly settingLabel: string;
  readonly settingDescription: string;
  readonly version: string;
}

const FNV_OFFSET_HIGH = 0xcbf29ce4;
const FNV_OFFSET_LOW = 0x84222325;
const FNV_PRIME_HIGH = 0x01000193;
const FNV_PRIME_LOW = 0x01000195;
const HASH_HALF_HEX_LENGTH = 8;

function noticeVersion(parts: {
  title: string;
  statements: readonly string[];
  links: readonly NamedProviderNoticeLink[];
}): string {
  const canonical = JSON.stringify({
    t: parts.title,
    s: parts.statements,
    l: parts.links.map((link) => [link.label, link.href]),
  });
  let high = FNV_OFFSET_HIGH;
  let low = FNV_OFFSET_LOW;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    high = Math.imul((high ^ code) >>> 0, FNV_PRIME_HIGH) >>> 0;
    low = Math.imul((low ^ code) >>> 0, FNV_PRIME_LOW) >>> 0;
  }
  const hex = (half: number) => half.toString(16).padStart(HASH_HALF_HEX_LENGTH, '0');
  return `fnv-${hex(high)}${hex(low)}`;
}

export type FreeModelNoticeProviderId = Extract<
  ChineseHqProviderId,
  keyof typeof NON_US_VENDOR_TRANSPORT_DEPLOYMENTS
>;

// A notice exists only for a provider whose deployment the residency record
// names, so no notice tells a person where their requests go on anything but
// that record. A caller with no notice has nothing a person could agree to and
// must not send.
export function hasFreeModelProviderNotice(
  providerId: string,
): providerId is FreeModelNoticeProviderId {
  return isChineseHqProvider(providerId) && nonUsVendorTransportDeployment(providerId) !== null;
}

/**
 * The notice a person agrees to before a free model run by a provider on the
 * China-headquartered list answers for them. Every sentence is a fact the
 * repository records; none describes how the provider uses or keeps data.
 */
export function composeFreeModelProviderNotice(
  providerId: FreeModelNoticeProviderId,
): NamedProviderNotice {
  const providerName = chineseHqProviderDisplayName(providerId);
  const deployment = NON_US_VENDOR_TRANSPORT_DEPLOYMENTS[providerId];
  const title = `Use ${providerName} for free models?`;
  const statements = [
    `${providerName} is a China-headquartered AI provider, and it runs the free models you are about to use.`,
    `Requests for these free models go to its ${deployment.accessRegion} region. The provider says the model may run on its servers ${deployment.inferenceScope}.`,
    "A chat message sends this chat's messages and images, your custom instructions with the name and work description you gave, your response style and time zone, the name, description and instructions of the project the chat is in, and the saved memories and past-chat excerpts used for the reply.",
    'A temporary chat sends no memories or past-chat excerpts, and sends your custom instructions only while it is set to Personalized. An image or video request sends only its prompt.',
    "These models are a limited free offer. The provider's free allowance is shared by everyone, does not renew, and ends when it is used up or expires.",
    'You can turn this off again in Settings, Privacy.',
  ];
  const links = [
    { label: 'Privacy Policy', href: NAMED_PROVIDER_NOTICE_PRIVACY_PATH },
    { label: 'Provider list', href: NAMED_PROVIDER_NOTICE_PROVIDER_LIST_PATH },
  ];
  return {
    providerId,
    providerName,
    title,
    statements,
    links,
    acceptLabel: 'Agree and continue',
    settingLabel: `Use ${providerName} for free models`,
    settingDescription: `Lets free models run by ${providerName} answer your messages. Turn it off and the next message to one of them asks again before anything is sent.`,
    version: noticeVersion({ title, statements, links }),
  };
}

export function isNamedProviderConsentCurrent(
  consent: NamedProviderConsent | null,
  notice: Pick<NamedProviderNotice, 'providerId' | 'version'>,
): boolean {
  return (
    consent !== null &&
    consent.accepted === true &&
    consent.providerId === notice.providerId &&
    consent.disclosureVersion === notice.version
  );
}

export function namedProviderConsentRecord(input: {
  notice: Pick<NamedProviderNotice, 'providerId' | 'version'>;
  accepted: boolean;
  surface: NamedProviderConsent['surface'];
  now: Date;
}): NamedProviderConsent {
  return {
    providerId: input.notice.providerId,
    accepted: input.accepted,
    acceptedAt: input.now.toISOString(),
    disclosureVersion: input.notice.version,
    surface: input.surface,
  };
}
