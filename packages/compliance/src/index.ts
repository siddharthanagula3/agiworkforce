/**
 * @agiworkforce/compliance
 *
 * EU AI Act Article 50 transparency obligations for AGI.
 *
 * Public exports — two thematic groups:
 *
 *   - **Article50Disclosure** — first-run "you are interacting with AI"
 *     disclosure (Article 50(1)). Combined with Apple Guideline 5.1.2(i)
 *     named-provider consent so the user is never double-prompted.
 *
 *   - **Article50Marker** — machine-readable provenance + `<meta>` tag for
 *     every AI-generated text / audio / image / video export (Article 50(2)).
 *
 * Plus:
 *   - the LLM HTTP-client gate that runs before the first `/api/llm/*` call,
 *   - the Chinese-HQ provider default-off registry (PRD V5 R-023).
 *
 * Verbatim citations and the canonical EU AI Act source URL live in
 * `article50-text.ts`.
 */

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

/**
 * Convenience namespace aliases requested by the integration spec. Lets
 * downstream call sites import either the named symbols or the grouped
 * "Article50Disclosure" / "Article50Marker" identifiers as a barrel.
 *
 *   import { Article50Disclosure, Article50Marker } from '@agiworkforce/compliance';
 *   Article50Disclosure.compose({ ... });
 *   Article50Marker.injectAiGeneratedMetaTag({ ... });
 */
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
