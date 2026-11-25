---
id: "REQ-AREA-105"
type: "requirements"
title: "Requirement items: Developer platform and console"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 105. Developer platform and console

30 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S105.01

**Developer organization/project creation.** A developer can create an organization and projects that scope API keys, usage and limits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-01 Projects with monthly credit limits](../../20-features/105-developer-platform-and-console/F105-01-projects-with-monthly-credit-limits.md)

## S105.02

**API-key management.** A developer can create scoped API keys (with expiry), see them masked with last-used time, and revoke them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-02 API keys](../../20-features/105-developer-platform-and-console/F105-02-api-keys.md)

## S105.03

**Service-account management.** A workspace admin can create non-human service identities with scoped keys, list them and disable or revoke them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-03 Service accounts (workspace admin)](../../20-features/105-developer-platform-and-console/F105-03-service-accounts-workspace-admin.md)

## S105.04

**Model catalog.** Developers can browse the models their key can call, with capabilities and context size.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F105-04 Model list and deprecation notices](../../20-features/105-developer-platform-and-console/F105-04-model-list-and-deprecation-notices.md)

## S105.05

**API playground.** Developers can send test requests to the API from a browser playground and see the response.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-05 Try a request in the browser](../../20-features/105-developer-platform-and-console/F105-05-try-a-request-in-the-browser.md)

## S105.06

**Request builder.** Developers can compose an API request (model, params, messages) in a form and copy it as code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-05 Try a request in the browser](../../20-features/105-developer-platform-and-console/F105-05-try-a-request-in-the-browser.md)

## S105.07

**Streaming event inspector.** Developers can watch the raw streamed events of an API call in an inspector.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-12 Inspectors and data tools (not built)](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)

## S105.08

**Tool-call inspector.** Developers can inspect the tool calls (arguments, results) made during an API request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-12 Inspectors and data tools (not built)](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)

## S105.09

**Structured-output schema editor.** Developers can author and validate a structured-output JSON schema in the console.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-12 Inspectors and data tools (not built)](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)

## S105.10

**File upload and reuse.** Developers can upload files once through the API/console and reuse them by id across requests.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-12 Inspectors and data tools (not built)](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)

## S105.11

**Retrieval collection manager.** Developers can create and manage retrieval collections (vector stores) and query them from API calls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-12 Inspectors and data tools (not built)](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)

## S105.12

**Prompt templates.** Developers can save reusable prompt templates (with arguments) and invoke them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F105-06 Prompt templates, versions and test cases](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)

## S105.13

**Prompt versions.** Prompt templates keep versions that can be compared and rolled back.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing
- Feature: [F105-06 Prompt templates, versions and test cases](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)

## S105.14

**Evaluation datasets.** Developers can build evaluation datasets of inputs and expected outputs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-06 Prompt templates, versions and test cases](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)

## S105.15

**Evaluation runs.** Developers can run a dataset against a model/prompt as an evaluation run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-06 Prompt templates, versions and test cases](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)

## S105.16

**Per-case evaluation results.** Evaluation results are shown per case with scores and diffs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-06 Prompt templates, versions and test cases](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)

## S105.17

**Trace explorer.** Developers can browse traces/logs of their API requests with timing and steps.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F105-07 Request logs and usage](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)

## S105.18

**Usage and cost dashboards.** Developers can see usage and cost over time, broken down by model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F105-07 Request logs and usage](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)

## S105.19

**Rate-limit inspection.** Developers can see their rate limits and how close they are to them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-08 Rate limits and budget caps](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)

## S105.20

**Budget controls.** An owner can set a spend cap that the API enforces.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F105-08 Rate limits and budget caps](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)

## S105.21

**Webhook configuration.** Developers can register a webhook endpoint and choose which events it receives.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-09 Webhooks](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)

## S105.22

**Webhook event history.** Developers can see a history of webhook deliveries with status and can redeliver.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-09 Webhooks](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)

## S105.23

**SDK documentation.** There is documentation for official client SDKs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-10 Docs, reference and support](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)

## S105.24

**API reference.** A published API reference documents every public endpoint, credential and scope.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-10 Docs, reference and support](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)

## S105.25

**Integration examples.** Docs include copyable integration examples (curl, Python, TypeScript).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-10 Docs, reference and support](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)

## S105.26

**Migration guides.** Developers get migration guides for API/model changes and from other providers.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-10 Docs, reference and support](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)

## S105.27

**Deprecation notices.** Developers are told ahead of time when a model or API is deprecated.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-04 Model list and deprecation notices](../../20-features/105-developer-platform-and-console/F105-04-model-list-and-deprecation-notices.md)

## S105.28

**Developer support.** Developers have a support channel (tickets or contact) reachable from the product.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI unverified
- Feature: [F105-10 Docs, reference and support](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)

## S105.29

**Custom app/Plugin testing.** A developer can load an unpublished custom plugin into their own account to try it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done
- Feature: [F105-11 Plugin testing and publishing](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)

## S105.30

**Publishing workflow.** A developer can submit a plugin/app for review and publish versions to users.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F105-11 Plugin testing and publishing](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)
