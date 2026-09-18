---
id: workspace-policy
title: Workspace policy: features, models and exceptions
path: /workspace/policy
category: administration
tags: policy, workspace policy, feature controls, disable feature, model policy, connector policy, reasoning effort, allowed countries, surfaces, retention, exceptions, override
updated: 2026-09-17
scope: public
---

## What policy controls

A workspace policy narrows what its members can do. Four things can be set:

- **Feature access**: each of Work, Code, Research, Skills, Plugins, Hooks,
  Browser, Computer use, Remote Control, Schedules, Event triggers and Projects
  can be turned off for the workspace. All are on by default.
- **Default model**: the model members start on.
- **Highest reasoning level**: a ceiling on how hard a model may think, chosen
  from none, minimal, low, medium, high, xhigh and max. Left unset, there is no
  reasoning limit.
- **Where work may run**: the countries and the surfaces the workspace permits.

Model policy and connector policy have their own pages: which models and
providers are permitted, and which integrations are.

## Exceptions

Policy can be overridden for a role, a directory group, or a single user, so one
team can keep a capability the rest of the workspace does not have. Where
several overrides apply to the same person, the most restrictive value wins:
an exception cannot be used to widen access past what the workspace itself
allows.

## Retention and legal holds

The data page carries retention settings per domain and the record of what
retention has already deleted, plus legal holds that suspend deletion for
material under investigation. A hold takes precedence over a retention window.

## Spend

A workspace spend limit caps managed cloud consumption, and usage analytics
attribute what was spent to a member, a model and a provider.

## Audit

Policy changes are administrative events, so they land in the audit trail with
everything else and can be exported or streamed to a SIEM. If you are asked to
prove when a control was turned on, that is where the answer is.

## What members see

A member does not see the console, but they do meet the policy: a feature turned
off is absent rather than failing, and a model the workspace does not permit
does not appear in the picker.
