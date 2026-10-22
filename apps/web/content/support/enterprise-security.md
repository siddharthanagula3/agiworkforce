---
id: enterprise-security
title: Security review of AGI for an enterprise
path: /enterprise
category: administration
tags: enterprise, security review, questionnaire, soc 2, hipaa, certification, audit export, siem, trust ledger, data residency, procurement, evaluation
updated: 2026-10-12
description: What to evaluate before you sign: what is claimed, administrator controls, audit evidence and data residency.
scope: public
---

## Evaluate before you sign anything

Local mode and BYOK need no contract, no trial and no seat. They run in the
CLI, which is {{STATUS.cli}}. In Local mode on the CLI, conversations stay on
your device and are never uploaded. A signed-in CLI may still refresh the
managed model catalog when it is not cached.
See [Run a local model](https://agiworkforce.com/help/local-mode) for setup.

## What is claimed, and what is not

Claims are dated on the trust ledger rather than asserted in prose. Two things
are stated plainly there and worth knowing before you write a questionnaire:

- HIPAA-covered workflows are not offered today.
- No certification body is engaged and no certification date is claimed.
  Anything on the roadmap stays on the roadmap with no date until there is one.

Read the ledger for the current state rather than a sales page, and send the
questionnaire; terms are negotiated against your procurement rather than by
click-through.

## Controls an administrator actually has

- Local, BYOK and managed cloud allowed or refused per workspace.
- Public share links and phone sync switched off server side, not by asking
  people not to use them.
- Retention windows, enforced once the workspace turns them on, with a record
  of what retention deleted and legal holds that suspend it.
- Feature, model and connector policy, with exceptions scoped to a role, a
  group or a person.
- The model that answered, named on the reply, and a **Local** mark on a reply
  from a model running on the device.

## Audit evidence

The audit trail is an append-only table, newest first, one event per line,
streamed as it is read. An administrator downloads it as JSONL, or has signed
batches drained to a SIEM endpoint every thirty minutes.

## Data residency

Hosted data lives in the United States. EU and UK residency hosting is on the
roadmap and is not available today. Local conversations never leave the device
in the first place, which is the residency answer for the strictest cases.

Local mode runs in the CLI, which is {{STATUS.cli}}.
