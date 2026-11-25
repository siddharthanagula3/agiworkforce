---
id: "REQ-AREA-101"
type: "requirements"
title: "Requirement items: Shared package boundaries"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 101. Shared package boundaries

38 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S101.01

**Shared request/response contracts.** Client-called API routes and every client parse request/response bodies with one shared schema package.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.02

**Shared event schemas.** Streamed and domain events are declared once and parsed through the same schema on every surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-02 Shared events, notifications, content blocks, errors and identifiers](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)

## S101.03

**Shared content-block schemas.** Message content blocks come from one vocabulary that every client renders or degrades explicitly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-02 Shared events, notifications, content blocks, errors and identifiers](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)

## S101.04

**Shared error definitions.** Error codes, classes and retryability are defined once and every client maps them rather than inferring its own.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-02 Shared events, notifications, content blocks, errors and identifiers](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)

## S101.05

**Shared resource identifiers.** Resource identifiers follow one contract applied to every primary key, and ids are server-minted values clients carry unchanged.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-02 Shared events, notifications, content blocks, errors and identifiers](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)

## S101.06

**Shared model metadata.** Model metadata comes from one compiled registry shared by TypeScript and Rust, with no private copies in clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-03 Plan, capability, model and policy decisions](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)

## S101.07

**Shared capability resolution.** Capabilities are resolved once on the server and every client reads that decision instead of deciding locally.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-03 Plan, capability, model and policy decisions](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)

## S101.08

**Shared entitlement resolution.** Plan entitlements are resolved through one server entry point from one shared plan vocabulary.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-03 Plan, capability, model and policy decisions](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)

## S101.09

**Shared policy contracts.** Workspace policy keys are declared once and every declared key is enforced by the server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-03 Plan, capability, model and policy decisions](../../20-features/101-shared-package-boundaries/F101-03-plan-capability-model-and-policy-decisions.md)

## S101.10

**Shared authentication client.** One authentication client (sign-in, device flow, token refresh) is shared by every client surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-04 Sign-in, API and streaming clients](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)

## S101.11

**Shared API client.** Every client calls the server through the same API client modules.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-04 Sign-in, API and streaming clients](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)

## S101.12

**Shared streaming client.** One streaming client (SSE reading, reconnect, event parsing) is shared by every client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-04 Sign-in, API and streaming clients](../../20-features/101-shared-package-boundaries/F101-04-sign-in-api-and-streaming-clients.md)

## S101.13

**Shared conversation-state logic.** Conversation state transitions (activity, queue, message status) use one shared reducer on every client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-05 Conversation state, sync and agent tasks](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)

## S101.14

**Shared synchronization logic.** Sync (cursors, push/pull, tombstones, conflicts) runs through one shared implementation on every synced surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-05 Conversation state, sync and agent tasks](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)

## S101.15

**Shared Project models.** Project records have one shared model used by the server and every client.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.16

**Shared file/Library models.** Files and Library items share one file model across server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.17

**Shared artifact models.** Artifacts share one model across server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.18

**Shared source/citation models.** Sources and citations use one shared model on every surface that shows them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-99 Other items in Shared package boundaries](../../20-features/101-shared-package-boundaries/F101-99-other-items.md)

## S101.19

**Shared Memory contracts.** Memory records and controls share one contract across server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.20

**Shared tool definitions.** Tool definitions share one Rust-owned shape and every offerable tool is declared once.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-06 Tools, approvals, skills and the coding-session protocol](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)

## S101.21

**Shared approval contracts.** Approval requests, decisions and resume share one contract across server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-06 Tools, approvals, skills and the coding-session protocol](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)

## S101.22

**Shared connector interfaces.** Connectors expose one shared interface (connection, health, policy) to server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.23

**Shared Skill/Plugin manifests.** Skill and plugin manifests are parsed by one shared implementation everywhere.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-06 Tools, approvals, skills and the coding-session protocol](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)

## S101.24

**Shared agent/task models.** Agent runs and tasks share one model and one lifecycle vocabulary across server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-05 Conversation state, sync and agent tasks](../../20-features/101-shared-package-boundaries/F101-05-conversation-state-sync-and-agent-tasks.md)

## S101.25

**Shared coding-session protocol.** The local coding-session protocol is defined once in Rust and generated for every TypeScript consumer, with CI failing on drift.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-06 Tools, approvals, skills and the coding-session protocol](../../20-features/101-shared-package-boundaries/F101-06-tools-approvals-skills-and-the-coding-session-prot.md)

## S101.26

**Shared usage/billing models.** Usage and billing figures use one shared model on server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.27

**Shared notifications.** Notifications use one shared category and target vocabulary on server and clients.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-02 Shared events, notifications, content blocks, errors and identifiers](../../20-features/101-shared-package-boundaries/F101-02-shared-events-notifications-content-blocks-errors.md)

## S101.28

**Shared localization.** Every UI surface draws its strings from one shared localization catalogue.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-07 Design tokens, UI primitives, text and Markdown](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)

## S101.29

**Shared design tokens.** Every GUI surface takes colours, radii and type from one shared token package.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-07 Design tokens, UI primitives, text and Markdown](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)

## S101.30

**Shared web UI primitives.** Every web-rendered surface builds UI from one shared primitive library.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-07 Design tokens, UI primitives, text and Markdown](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)

## S101.31

**Platform-specific native UI primitives.** Each native surface has its own primitive layer that screens use instead of raw platform controls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-07 Design tokens, UI primitives, text and Markdown](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)

## S101.32

**Shared Markdown/content transformations.** Markdown and content transformations run through one shared implementation on every surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-07 Design tokens, UI primitives, text and Markdown](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)

## S101.33

**Platform-specific renderers.** Each surface has a renderer for the shared content model that declares which block kinds it renders and degrades the rest.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-07 Design tokens, UI primitives, text and Markdown](../../20-features/101-shared-package-boundaries/F101-07-design-tokens-ui-primitives-text-and-markdown.md)

## S101.34

**Shared telemetry conventions.** Telemetry and analytics follow one shared vocabulary and redaction path on every surface.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-08 Telemetry, configuration, security helpers and package runtimes](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)

## S101.35

**Shared test data and schema conformance fixtures.** Wire contracts have shared golden fixtures that every implementation (server, TS clients, Rust) is tested against.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-01 Shared request and response shapes](../../20-features/101-shared-package-boundaries/F101-01-shared-request-and-response-shapes.md)

## S101.36

**Shared configuration validation.** Configuration for every surface is validated through one shared registry and validator.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-08 Telemetry, configuration, security helpers and package runtimes](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)

## S101.37

**Shared security-sensitive utility code.** Security-sensitive helpers (crypto, redaction, path containment) live in one shared place that every surface uses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-08 Telemetry, configuration, security helpers and package runtimes](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)

## S101.38

**Explicit browser-only, server-only, and native-only exports.** Shared packages declare browser-only, server-only and native-only entry points explicitly.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F101-08 Telemetry, configuration, security helpers and package runtimes](../../20-features/101-shared-package-boundaries/F101-08-telemetry-configuration-security-helpers-and-packa.md)
