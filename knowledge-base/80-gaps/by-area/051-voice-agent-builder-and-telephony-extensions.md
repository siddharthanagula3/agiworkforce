---
id: "GAPS-AREA-051"
type: "gap-list"
title: "Gaps: Voice-agent builder and telephony extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 51. Voice-agent builder and telephony extensions

45 open gaps that touch this area. Area page: [20-features/051-voice-agent-builder-and-telephony-extensions](../../20-features/051-voice-agent-builder-and-telephony-extensions/README.md).

## GAP-AREA051-LW02

**The voice marketing page describes voice as spoken conversation and dictation only. It does not describe voice agents, so it is consistent with the code, but a reader may look for agents there.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-051
- Detail: Area 51. Voice-agent builder and telephony extensions
- Evidence: apps/web/app/features/voice/page.tsx:34

## GAP-AREA051-LW03

**The chat voice session store is a live session for chat, and its name does not say so. A reader might assume it is the base for agents. It is not, and nothing in it refers to an agent, number or call.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-051
- Detail: Area 51. Voice-agent builder and telephony extensions
- Evidence: apps/web/app/api/voice/live/sessions/lib/voice-session-store.ts:115

## GAP-F051-01-01

**No voice-agent wizard or builder on any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-01](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-01-create-and-configure-a-voice-agent.md)
- Detail: Affects: Web, Desktop, Mobile owners. Work needed: Design and build the wizard once in shared UI; add routes on the surfaces.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl: S51.01 missing

## GAP-F051-01-02

**No API or data model for voice agents (name, role, instructions, voice, goals)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-01](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-01-create-and-configure-a-voice-agent.md)
- Detail: Affects: all surfaces. Work needed: Extend or add a contract, migration and endpoints.
- Evidence: ledger S51.02, S51.03, S51.04, S51.07 api missing; no table found

## GAP-F051-01-03

**Plan, quota and empty/failure states not specified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-01](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-01-create-and-configure-a-voice-agent.md)
- Detail: Affects: product definition. Work needed: Write the requirement under docs/product.
- Evidence: brief gives only Should lines

## GAP-F051-01-NOTBUILT

**Create and configure a voice agent: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-01](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-01-create-and-configure-a-voice-agent.md)
- Requirement items: S51.01, S51.02, S51.03, S51.04, S51.07
- Detail: Web: S51.01, S51.02, S51.03, S51.04, S51.07; Desktop: S51.01, S51.02, S51.03, S51.04, S51.07; Mobile: S51.01, S51.02, S51.03, S51.04, S51.07

## GAP-F051-02-01

**No knowledge-source setup for voice agents**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-02](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-02-knowledge-sources-and-tools-for-a-voice-agent.md)
- Detail: Affects: Web, Desktop, Mobile owners. Work needed: Attach knowledge to a voice-agent record; retrieval at call time.
- Evidence: ledger S51.05 missing

## GAP-F051-02-02

**No per-agent tool or MCP selection for calls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-02](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-02-knowledge-sources-and-tools-for-a-voice-agent.md)
- Detail: Affects: Web, Desktop, Mobile owners. Work needed: Per-agent allow list tied to the tool approval policy.
- Evidence: ledger S51.06 missing; live voice tools are per user (apps/web/lib/voice/live-voice-tools.ts:295)

## GAP-F051-02-03

**Failure behaviour and limits unspecified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-02](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-02-knowledge-sources-and-tools-for-a-voice-agent.md)
- Detail: Affects: product definition. Work needed: Write the requirement.
- Evidence: brief

## GAP-F051-02-NOTBUILT

**Knowledge sources and tools for a voice agent: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-02](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-02-knowledge-sources-and-tools-for-a-voice-agent.md)
- Requirement items: S51.05, S51.06
- Detail: Web: S51.05, S51.06; Desktop: S51.05, S51.06; Mobile: S51.05, S51.06

## GAP-F051-03-01

**No guardrail configuration**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-03](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-03-guardrails-business-hours-and-fallback.md)
- Detail: Affects: Web, Desktop, Mobile owners. Work needed: Fields, enforcement and tests.
- Evidence: ledger S51.08 missing

## GAP-F051-03-02

**No business hours**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-03](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-03-guardrails-business-hours-and-fallback.md)
- Detail: Affects: same. Work needed: Schedule model with time zone and out-of-hours behaviour.
- Evidence: ledger S51.24 missing

## GAP-F051-03-03

**No escalation or fallback**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-03](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-03-guardrails-business-hours-and-fallback.md)
- Detail: Affects: same. Work needed: Fallback targets (voicemail, callback, human) and failure handling; depends on F051-04.
- Evidence: ledger S51.25 missing

## GAP-F051-03-NOTBUILT

**Guardrails, business hours and fallback: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-03](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-03-guardrails-business-hours-and-fallback.md)
- Requirement items: S51.08, S51.24, S51.25
- Detail: Web: S51.08, S51.24, S51.25; Desktop: S51.08, S51.24, S51.25; Mobile: S51.08, S51.24, S51.25

## GAP-F051-04-01

**No call transfer capability or telephony transport**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-04](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-04-transfer-a-live-call-to-a-human.md)
- Detail: Affects: Web, Desktop, Mobile owners and callers. Work needed: Choose carrier path, build transfer action with consent and logging.
- Evidence: ledger S51.09 missing

## GAP-F051-04-02

**Targets and no-answer handling unspecified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-04](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-04-transfer-a-live-call-to-a-human.md)
- Detail: Affects: product definition. Work needed: Write the requirement.
- Evidence: brief

## GAP-F051-04-03

**Number provisioning and call routing, which a transfer needs, are also missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-04](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-04-transfer-a-live-call-to-a-human.md)
- Detail: Affects: all. Work needed: Build telephony base first.
- Evidence: ledger S51.12 to S51.16 missing (rows outside this feature)

## GAP-F051-04-NOTBUILT

**Transfer a live call to a human: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-04](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-04-transfer-a-live-call-to-a-human.md)
- Requirement items: S51.09
- Detail: Web: S51.09; Desktop: S51.09; Mobile: S51.09

## GAP-F051-05-01

**No test-call control or draft-bound session**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-05](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-05-test-a-draft-voice-agent.md)
- Detail: Affects: Web, Desktop, Mobile owners. Work needed: Extend session creation to accept a draft agent and build the control.
- Evidence: ledger S51.10 missing; session request has no agent (route.ts:149-162)

## GAP-F051-05-02

**Metering and transcript visibility for tests unspecified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-05](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-05-test-a-draft-voice-agent.md)
- Detail: Affects: product and billing. Work needed: Decide and write requirement.
- Evidence: brief

## GAP-F051-05-NOTBUILT

**Test a draft voice agent: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-05](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-05-test-a-draft-voice-agent.md)
- Requirement items: S51.10
- Detail: Web: S51.10; Desktop: S51.10; Mobile: S51.10

## GAP-F051-06-01

**No embed snippet or widget**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-06](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-06-embed-a-voice-agent-on-a-website.md)
- Detail: Affects: Web owners and website visitors. Work needed: Embed route, key issuance, allowed domains, client widget.
- Evidence: ledger S51.11 missing

## GAP-F051-06-02

**Public visitors have no auth model; text-agent visibility has no public value**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-06](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-06-embed-a-voice-agent-on-a-website.md)
- Detail: Affects: all. Work needed: Design anonymous visitor sessions with limits and abuse control.
- Evidence: packages/contracts/cloud-contracts/src/agents.ts:14; live voice start needs sign-in

## GAP-F051-06-03

**Snippet issuance and recording notice unspecified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-06](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-06-embed-a-voice-agent-on-a-website.md)
- Detail: Affects: product and legal. Work needed: Write requirement; legal text goes through the compliance owner (docs/compliance).
- Evidence: brief

## GAP-F051-06-NOTBUILT

**Embed a voice agent on a website: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-06](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-06-embed-a-voice-agent-on-a-website.md)
- Requirement items: S51.11
- Detail: Web: S51.11; Desktop: S51.11; Mobile: S51.11

## GAP-F051-07-01

**Number provisioning, bring-your-own-number, SIP setup and inbound routing do not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-07](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-07-phone-numbers-and-call-routing.md)
- Detail: Affects: Owners on web, desktop (hosted web app) and mobile; API consumers. Work needed: Choose a carrier route, add tables and API, build owner screens, add entitlement and metering.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1672-1675

## GAP-F051-07-02

**Twilio connector card promises voice calls.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-07](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-07-phone-numbers-and-call-routing.md)
- Detail: Affects: Web connector users. Work needed: Reword the summary or ship calling.
- Evidence: apps/web/features/connectors/data/connectors.ts:659; audit/doc-corrections/contradictions-register.md:86

## GAP-F051-07-03

**No rule for number ownership verification or no-match fallback.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-07](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-07-phone-numbers-and-call-routing.md)
- Detail: Affects: All future owners. Work needed: Decide and document in docs/product.
- Evidence: S51.13 and S51.15 in the area brief give no detail

## GAP-F051-07-NOTBUILT

**Phone numbers and call routing: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-07](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-07-phone-numbers-and-call-routing.md)
- Requirement items: S51.12, S51.13, S51.14, S51.15
- Detail: Web: S51.12, S51.13, S51.14, S51.15; Desktop: S51.12, S51.13, S51.14, S51.15; Mobile: S51.12, S51.13, S51.14, S51.15

## GAP-F051-08-01

**No outbound calling exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-08](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-08-outbound-calls.md)
- Detail: Affects: Owners on web, desktop, mobile and API. Work needed: Carrier integration, authorisation model, consent store, limits, metering, UI.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1676

## GAP-F051-08-02

**Authorisation check, calling limits and consent rules are not specified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-08](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-08-outbound-calls.md)
- Detail: Affects: All future callers. Work needed: Write the rules in docs/product and docs/compliance before building.
- Evidence: S51.16 gives only the one-line Should

## GAP-F051-08-03

**Misleading connector copy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-08](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-08-outbound-calls.md)
- Detail: Affects: Web connector users. Work needed: Reword.
- Evidence: audit/doc-corrections/contradictions-register.md:86

## GAP-F051-08-NOTBUILT

**Outbound calls: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-08](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-08-outbound-calls.md)
- Requirement items: S51.16
- Detail: Web: S51.16; Desktop: S51.16; Mobile: S51.16

## GAP-F051-09-01

**No transcripts, recordings, consent controls or outcome labels exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-09](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-09-call-records-transcripts-recordings-and-outcomes.md)
- Detail: Affects: Owners on web, desktop, mobile and API. Work needed: Call data tables, storage, API, owner screens, retention job, erasure integration.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1677-1679

## GAP-F051-09-02

**Access rules and retention length are unspecified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-09](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-09-call-records-transcripts-recordings-and-outcomes.md)
- Detail: Affects: All future owners and callers. Work needed: Decide in docs/product and docs/compliance.
- Evidence: S51.17 and S51.18 give no values

## GAP-F051-09-NOTBUILT

**Call records: transcripts, recordings and outcomes: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-09](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-09-call-records-transcripts-recordings-and-outcomes.md)
- Requirement items: S51.17, S51.18, S51.19
- Detail: Web: S51.17, S51.18, S51.19; Desktop: S51.17, S51.18, S51.19; Mobile: S51.17, S51.18, S51.19

## GAP-F051-10-01

**No latency or failure dashboard.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-10](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-10-latency-failure-and-usage-dashboards.md)
- Detail: Affects: Owners on web, desktop, mobile. Work needed: Capture per-turn timings and outcomes, add an API and a dashboard.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1680

## GAP-F051-10-02

**No call minute or cost metering or billing view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-10](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-10-latency-failure-and-usage-dashboards.md)
- Detail: Affects: Owners, billing, all apps. Work needed: Connect calls to the managed usage lifecycle and show the result.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1681

## GAP-F051-10-03

**Time window and billing unit unspecified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-10](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-10-latency-failure-and-usage-dashboards.md)
- Detail: Affects: Product and billing. Work needed: Decide and document.
- Evidence: S51.20 and S51.21 give none

## GAP-F051-10-NOTBUILT

**Latency, failure and usage dashboards: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-10](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-10-latency-failure-and-usage-dashboards.md)
- Requirement items: S51.20, S51.21
- Detail: Web: S51.20, S51.21; Desktop: S51.20, S51.21; Mobile: S51.20, S51.21

## GAP-F051-11-01

**No voice-agent configuration, versions, publish or rollback.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-11](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-11-versions-publish-and-rollback.md)
- Detail: Affects: Owners on web, desktop, mobile and API. Work needed: Define the voice agent record, then reuse the version and publish pattern with its own table and routes.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1682-1683

## GAP-F051-11-02

**Rollback is Restore plus Publish, not one step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-11](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-11-versions-publish-and-rollback.md)
- Detail: Affects: Custom agent owners on web. Work needed: Add a direct set-live action if voice rollback must be instant.
- Evidence: apps/web/lib/services/custom-agent-service.ts:533-551

## GAP-F051-11-03

**In-progress call handling on publish or rollback is not specified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-11](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-11-versions-publish-and-rollback.md)
- Detail: Affects: Voice callers. Work needed: Decide and document.
- Evidence: S51.23 gives no rule

## GAP-F051-11-04

**Mobile and desktop screens for version history are unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F051-11](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-11-versions-publish-and-rollback.md)
- Detail: Affects: Mobile and desktop users of custom agents. Work needed: Inspect the mobile and Tauri code.
- Evidence: only mobile service test seen (apps/mobile/src/features/agents/__tests__/service.test.ts:65-74)

## GAP-F051-11-NOTBUILT

**Versions, publish and rollback: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F051-11](../../20-features/051-voice-agent-builder-and-telephony-extensions/F051-11-versions-publish-and-rollback.md)
- Requirement items: S51.22, S51.23
- Detail: Web: S51.22, S51.23; Desktop: S51.22, S51.23; Mobile: S51.22, S51.23
