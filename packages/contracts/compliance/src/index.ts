
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
  Article50DisclosureRequiredError,
  ChineseHqProviderNotOptedInError,
  assertLlmGate,
  isLlmGateOpen,
} from './llm-gate';

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
