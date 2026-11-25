---
id: "REQ-AREA-088"
type: "requirements"
title: "Requirement items: Support, trust, and policy product"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 88. Support, trust, and policy product

31 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S88.01

**Contextual help links.** Screens that need explaining link straight to the matching help or docs article for that feature.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F088-01 Help centre and help links](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)

## S88.02

**Searchable help center.** Users can search a help centre and open matching articles.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI missing, Chrome unverified
- Seen in a real run: Web PASS
- Feature: [F088-01 Help centre and help links](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)

## S88.03

**Contact-support flow.** A signed-in user can reach support from the product, describe a problem, and follow the replies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome unverified
- Seen in a real run: Web UI_ONLY
- Feature: [F088-02 Contact support and support tickets](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)

## S88.04

**Report-a-bug flow.** A user can report a bug from the product, with enough context (build, platform) for support to act.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome unverified
- Seen in a real run: Web UI_ONLY
- Feature: [F088-03 Bug reports and diagnostic bundle](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)

## S88.05

**Product feedback.** Users can send general product feedback from inside the product and it is stored for the team.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F088-04 Product feedback and feature requests](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)

## S88.06

**Feature request.** Users can submit a feature request from inside the product and it is stored for the team.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F088-04 Product feedback and feature requests](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)

## S88.07

**User-reviewable diagnostic bundle.** A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F088-03 Bug reports and diagnostic bundle](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Competitor trace: CAP-privacy-and-data-controls-29, CAP-recovery-and-errors-13

## S88.08

**Request/error identifier.** When a request fails, the user sees a reference id they can quote to support.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F088-05 Reference ids for failed requests](../../20-features/088-support-trust-and-policy-product/F088-05-reference-ids-for-failed-requests.md)
- Competitor trace: CAP-recovery-and-errors-13

## S88.09

**Known-issue display.** The product shows users a list of currently known issues with their status or workaround.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F088-06 Service status, incidents and maintenance notices](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Competitor trace: CAP-recovery-and-errors-14

## S88.10

**Service-status integration.** Users can see current service status from the product, fed by live health checks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F088-06 Service status, incidents and maintenance notices](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Competitor trace: CAP-recovery-and-errors-14

## S88.11

**Incident notices.** During an incident, users see a notice in the product describing the problem and its status.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F088-06 Service status, incidents and maintenance notices](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Competitor trace: CAP-recovery-and-errors-14

## S88.12

**Maintenance notices.** Users are told about planned maintenance before and during it, inside the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F088-06 Service status, incidents and maintenance notices](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Competitor trace: CAP-recovery-and-errors-14

## S88.13

**Release-update education.** After an update, users learn what changed (what's new, release notes) from inside the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F088-07 Release and model-retirement notices, and migration help](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)

## S88.14

**Model-retirement notice.** Users are warned before a model they use is retired and told what replaces it when it is.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F088-07 Release and model-retirement notices, and migration help](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)

## S88.15

**Feature-migration assistant.** An assistant helps users move their data and settings from another product or a replaced feature, with a preview before changes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code missing, Chrome missing
- Feature: [F088-07 Release and model-retirement notices, and migration help](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)

## S88.16

**Privacy-rights request portal.** A user can submit access, correction or erasure requests and see their status in a privacy portal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Seen in a real run: Web UI_ONLY
- Feature: [F088-08 Privacy requests, cookie choices and jurisdiction notices](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Competitor trace: CAP-privacy-and-data-controls-13, CAP-privacy-and-data-controls-16

## S88.17

**Cookie preference center.** Users can review and change cookie categories at any time from a preference centre, and the choice is honoured.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Seen in a real run: Web PASS
- Feature: [F088-08 Privacy requests, cookie choices and jurisdiction notices](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)

## S88.18

**Content-reporting flow.** A user can report a harmful or problematic response from where it appears, and the report reaches moderation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F088-09 Reports and appeals (content, copyright, safety refusal, suspension)](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)

## S88.19

**Copyright/impersonation reporting.** Anyone can report copyright infringement or impersonation in hosted content and get a reference.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F088-09 Reports and appeals (content, copyright, safety refusal, suspension)](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)

## S88.20

**Safety-warning appeal.** When a response is refused for safety reasons, the user can appeal or report the refusal from that notice.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F088-09 Reports and appeals (content, copyright, safety refusal, suspension)](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)

## S88.21

**Account-suspension appeal.** A suspended user is told why and can appeal from where they are blocked, with a way to follow the appeal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F088-09 Reports and appeals (content, copyright, safety refusal, suspension)](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)

## S88.22

**Security vulnerability reporting.** Security researchers find a published way to report vulnerabilities (policy page and security.txt).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F088-10 Security, accessibility and policy pages](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)

## S88.23

**Accessibility feedback.** Users can report accessibility barriers through a dedicated, accessible channel from the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F088-10 Security, accessibility and policy pages](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)

## S88.24

**Policy-version history.** Users can see earlier versions of the terms and policies and what changed between them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F088-10 Security, accessibility and policy pages](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)

## S88.25

**Subprocessor information.** A current list of subprocessors, with a change log, is published.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Seen in a real run: Web PASS
- Feature: [F088-10 Security, accessibility and policy pages](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)

## S88.26

**Security/compliance evidence portal.** Customers can review security and compliance evidence (reports, certifications, questionnaires) in a trust portal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial
- Seen in a real run: Web PASS
- Feature: [F088-10 Security, accessibility and policy pages](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- An owner decision is open on this item.

## S88.27

**Jurisdiction-specific notices where applicable.** Where required, users in a jurisdiction see the notices that apply to them (e.g. India DPDP, EU representative, region blocks).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F088-08 Privacy requests, cookie choices and jurisdiction notices](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Competitor trace: CAP-privacy-and-data-controls-16

## S88.28

**Support assistant email and WhatsApp channels.** The support assistant answers customers by email and WhatsApp as well as in the web widget, as Intercom Fin does.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing
- Feature: [F088-11 Support assistant (answers, email and WhatsApp, languages, analytics)](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)

## S88.29

**Multilingual support answers.** The support assistant answers in the customer's language from the same help corpus.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing
- Feature: [F088-11 Support assistant (answers, email and WhatsApp, languages, analytics)](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)

## S88.30

**Support resolution and satisfaction analytics.** Operators see how many conversations the assistant resolved, handed off or failed, with customer satisfaction ratings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing
- Feature: [F088-11 Support assistant (answers, email and WhatsApp, languages, analytics)](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)

## S88.31

**Support content-gap suggestions.** The assistant reports questions it could not answer from the help corpus so the owner can write the missing articles.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing
- Feature: [F088-11 Support assistant (answers, email and WhatsApp, languages, analytics)](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)
