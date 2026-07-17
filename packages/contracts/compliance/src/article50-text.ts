/**
 * EU AI Act Article 50 — verbatim citations.
 *
 * Single source for both code comments and any UI surface that quotes the text.
 * The strings below are reproduced verbatim from Regulation (EU) 2024/1689
 * ("EU AI Act"), Chapter IV, Article 50 — "Transparency obligations for
 * providers and deployers of certain AI systems".
 *
 * Primary source: https://artificialintelligenceact.eu/article/50/
 * Official Journal: Regulation (EU) 2024/1689, OJ L, 12.7.2024.
 *
 * Article 50 enters full application on 2026-08-02 (Art. 113(c)).
 *
 * DO NOT EDIT FOR STYLE. Any non-typo change must be reviewed against the OJ
 * publication. We accept the EU's spelling ("recognisable", "behaviour") and
 * punctuation as-is.
 */

/**
 * Article 50(1) — verbatim.
 *
 * Citation: Regulation (EU) 2024/1689, Article 50(1).
 * Grounds the first-run "you are interacting with AI" disclosure.
 */
export const ARTICLE_50_1_VERBATIM =
  `Providers shall ensure that AI systems intended to interact directly with natural persons are designed and developed in such a way that the natural persons concerned are informed that they are interacting with an AI system, unless this is obvious from the point of view of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use. This obligation shall not apply to AI systems authorised by law to detect, prevent, investigate or prosecute criminal offences, subject to appropriate safeguards for the rights and freedoms of third parties, unless those systems are available for the public to report a criminal offence.` as const;

/**
 * Article 50(2) — verbatim.
 *
 * Citation: Regulation (EU) 2024/1689, Article 50(2).
 * Grounds the machine-readable marking on every AI-generated text / audio /
 * image / video export.
 */
export const ARTICLE_50_2_VERBATIM =
  `Providers of AI systems, including general-purpose AI systems, generating synthetic audio, image, video or text content, shall ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated. Providers shall ensure their technical solutions are effective, interoperable, robust and reliable as far as this is technically feasible, taking into account the specificities and limitations of various types of content, the costs of implementation and the generally acknowledged state of the art, as may be reflected in relevant technical standards. This obligation shall not apply to the extent the AI systems perform an assistive function for standard editing or do not substantially alter the input data provided by the deployer or the semantics thereof, or where authorised by law to detect, prevent, investigate or prosecute criminal offences.` as const;

/**
 * Article 50(4) (first subparagraph) — verbatim. Included because R-023 ties
 * Chinese-HQ provider routing to per-provider 5.1.2(i) consent + Article 50
 * disclosure, and Art. 50(4) governs deepfake / image-content labelling that
 * an EU deployer must surface.
 */
export const ARTICLE_50_4_VERBATIM =
  `Deployers of an AI system that generates or manipulates image, audio or video content constituting a deep fake, shall disclose that the content has been artificially generated or manipulated. This obligation shall not apply where the use is authorised by law to detect, prevent, investigate or prosecute criminal offences. Where the content forms part of an evidently artistic, creative, satirical, fictional or analogous work or programme, the transparency obligations set out in this paragraph are limited to disclosure of the existence of such generated or manipulated content in an appropriate manner that does not hamper the display or enjoyment of the work.` as const;

/**
 * The published canonical URL.
 * We never link to private mirrors — the official EU portal is authoritative.
 */
export const ARTICLE_50_SOURCE_URL = 'https://artificialintelligenceact.eu/article/50/' as const;

/**
 * Penalty exposure surfaced in onboarding copy so reviewers (Apple App Review
 * + EU legal) can see we are on-record about the consequence of non-compliance.
 * Numbers are pulled from Article 99(4) (general infringements category).
 */
export const ARTICLE_50_PENALTY_TEXT =
  'Non-compliance with Article 50 transparency obligations is a general infringement under Article 99(4): administrative fines up to EUR 15 000 000 or, for an undertaking, up to 3 % of total worldwide annual turnover for the preceding financial year, whichever is higher.' as const;
