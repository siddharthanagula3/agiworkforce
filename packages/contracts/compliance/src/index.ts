export {
  ARTICLE_50_1_VERBATIM,
  ARTICLE_50_2_VERBATIM,
  ARTICLE_50_4_VERBATIM,
  ARTICLE_50_PENALTY_TEXT,
  ARTICLE_50_SOURCE_URL,
} from './article50-text';

export {
  DISCLOSURE_LEDGER_KEY,
  composeFirstRunDisclosure,
  isDisclosureSatisfied,
  hashDisclosureCopy,
  recordDisclosureAcceptance,
  type DisclosureRecord,
  type DisclosureInputs,
  type DisclosureCopy,
  type DisclosureLedger,
} from './article50-disclosure';

export {
  buildProvenanceClaim,
  serialiseClaim,
  renderAiGeneratedMetaTag,
  injectAiGeneratedMetaTag,
  wrapTextExportWithMarker,
  hasAiGeneratedMarker,
  type C2paStyleClaim,
  type SyntheticContentKind,
} from './article50-marker';

export {
  CHINESE_HQ_PROVIDER_IDS,
  NAMED_PROVIDER_CONSENT_SURFACES,
  isChineseHqProvider,
  isProviderRoutingAllowed,
  chineseHqProviderDisplayName,
  type ChineseHqProviderId,
  type ConsentLedger,
  type Jurisdiction,
  type NamedProviderConsent,
} from './provider-jurisdiction';

export {
  DEVELOPER_JURISDICTION_POLICIES,
  allowedDeveloperJurisdictions,
  type DeveloperJurisdictionPolicy,
} from './developer-jurisdiction';

export {
  NON_US_VENDOR_TRANSPORTS,
  NON_US_VENDOR_TRANSPORT_DEPLOYMENTS,
  isNonUsVendorTransport,
  nonUsVendorTransportDeployment,
  transportResidency,
  type NonUsVendorTransport,
  type VendorTransportDeployment,
  type ProcessingResidency,
} from './transport-residency';

export {
  NAMED_PROVIDER_NOTICE_PRIVACY_PATH,
  NAMED_PROVIDER_NOTICE_PROVIDER_LIST_PATH,
  composeFreeModelProviderNotice,
  hasFreeModelProviderNotice,
  isNamedProviderConsentCurrent,
  namedProviderConsentRecord,
  type FreeModelNoticeProviderId,
  type NamedProviderNotice,
  type NamedProviderNoticeLink,
} from './named-provider-notice';

export {
  DATA_REGIONS,
  DATA_REGION_IDS,
  DEFAULT_DATA_REGION,
  CrossRegionRoutingRefusedError,
  DataRegionUnavailableError,
  assertSameDataRegion,
  configuredDataRegions,
  crossRegionRoutingDecision,
  dataRegionEnvName,
  dataRegionEnvNames,
  excludedTransportsFor,
  inferenceRouteSetAdmits,
  isDataRegionId,
  normaliseDataRegion,
  resolveDataRegion,
  selectDataRegion,
  type CrossRegionRoutingDecision,
  type DataRegionDefinition,
  type DataRegionFacet,
  type DataRegionId,
  type DataRegionResolution,
  type DataRegionRuntime,
  type InferenceRouteSet,
  type InferenceRouteSetMode,
} from './data-residency';

export {
  Article50DisclosureRequiredError,
  CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE,
  ChineseHqProviderNotOptedInError,
  assertLlmGate,
  isLlmGateOpen,
} from './llm-gate';

export {
  FREE_PLAN_TRAINING_DATA_DISCLOSURE,
  FREE_PLAN_TRAINING_SIGNUP_STATEMENT,
  FREE_PLAN_TRAINING_SIGNUP_NOTICE,
  FREE_PLAN_TRAINING_SIGNUP_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_TERMS_CARD_TITLE,
  FREE_PLAN_TRAINING_TERMS_CARD_BODY,
  FREE_PLAN_TRAINING_TERMS_CARD_LINK_LABEL,
  FREE_PLAN_TRAINING_NOTICE_TITLE,
  FREE_PLAN_TRAINING_NOTICE_LEAD,
  FREE_PLAN_TRAINING_NOTICE_TAIL,
  FREE_PLAN_TRAINING_CHAT_NOTICE_LEAD,
  FREE_PLAN_TRAINING_CHAT_NOTICE_TAIL,
  FREE_PLAN_TRAINING_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL,
} from './free-plan-training-disclosure';

export {
  FREE_MODEL_PROMOTION_PICKER_LABEL,
  FREE_MODEL_PROMOTION_NOTICE_TITLE,
  FREE_MODEL_PROMOTION_DISMISS_LABEL,
  freeModelPromotionHeadline,
} from './free-model-promotion-copy';

export { noticeAccountFingerprint } from './notice-account-fingerprint';

import {
  composeFirstRunDisclosure,
  isDisclosureSatisfied,
  recordDisclosureAcceptance,
} from './article50-disclosure';
import {
  buildProvenanceClaim,
  injectAiGeneratedMetaTag,
  renderAiGeneratedMetaTag,
  serialiseClaim,
  wrapTextExportWithMarker,
  hasAiGeneratedMarker,
} from './article50-marker';

export const Article50Disclosure = Object.freeze({
  compose: composeFirstRunDisclosure,
  isSatisfied: isDisclosureSatisfied,
  record: recordDisclosureAcceptance,
});

export const Article50Marker = Object.freeze({
  buildClaim: buildProvenanceClaim,
  serialiseClaim,
  renderMetaTag: renderAiGeneratedMetaTag,
  injectIntoHtml: injectAiGeneratedMetaTag,
  wrapText: wrapTextExportWithMarker,
  isMarked: hasAiGeneratedMarker,
});

export {
  SERVICE_REGION_SOURCES,
  UNSERVED_COUNTRIES,
  UNSERVED_SUBDIVISIONS,
  decideServiceRegion,
  isUnderUsSanctions,
  type ServiceRegionDecision,
  type ServiceRegionSource,
  type UnservedCountry,
  type UnservedReason,
  type UnservedSubdivision,
} from './service-regions';
