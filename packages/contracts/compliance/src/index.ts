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
  isChineseHqProvider,
  isProviderRoutingAllowed,
  chineseHqProviderDisplayName,
  type ChineseHqProviderId,
  type ConsentLedger,
  type Jurisdiction,
  type NamedProviderConsent,
} from './provider-jurisdiction';

export {
  NON_US_VENDOR_TRANSPORTS,
  isNonUsVendorTransport,
  transportResidency,
  type NonUsVendorTransport,
  type ProcessingResidency,
} from './transport-residency';

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
  FREE_PLAN_TRAINING_NOTICE_LINK_LABEL,
  FREE_PLAN_TRAINING_NOTICE_DISMISS_LABEL,
} from './free-plan-training-disclosure';

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
