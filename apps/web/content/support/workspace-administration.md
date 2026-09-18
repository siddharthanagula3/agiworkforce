---
id: workspace-administration
title: Administering a workspace
path: /workspace
category: administration
tags: admin, administration, workspace console, members, seats, invite, audit log, usage analytics, sharing, legal hold, retention, api keys, spend limit
updated: 2026-09-17
scope: public
---

## The workspace console

A workspace is administered from its own console rather than from personal
settings. Its sections are:

- **Overview**: the workspace's current posture at a glance.
- **Members**: who belongs to the workspace, what role they hold, and how many
  seats that consumes. Invitations and removals happen here.
- **Roles**: built-in and custom roles, additional roles, and the roles a
  directory group grants.
- **Policy**: privacy modes, managed compute, sync surfaces, retention,
  features and exceptions.
- **Models**: which models and providers the workspace permits.
- **Connectors**: which integrations the workspace permits.
- **Identity**: single sign-on, domain verification and SCIM directory
  provisioning.
- **Sharing**: the projects, conversations, artifacts and connectors shared
  across the workspace.
- **Usage**: managed cloud spend by member, model and provider.
- **Data**: legal holds, and the record of what retention has deleted.
- **Audit**: administrative and policy events, with export and SIEM streaming.
- **Billing**: plan, seats, and where workspace billing is managed.

## What members see

Members do not see the console. A member on a workspace-managed plan sees
read-only billing in their own settings, saying the plan is managed by the
organization and to contact an administrator to change it.

## Directory provisioning

SCIM 2.0 provisioning covers Users and Groups, so accounts and group membership
can be created, updated and deprovisioned from your identity provider rather
than by hand. Domain verification and single sign-on are configured on the same
page.

## Audit and usage

The audit trail records administrative and policy events and can be exported or
streamed to a SIEM. Usage analytics attribute managed cloud spend to a member, a
model and a provider, which is what you need to answer "who spent this" rather
than only "how much".

## Getting help with a workspace

Support asks for the **Organization ID** before anything workspace-wide. It is
shown in Settings, Account beside your user ID when the account belongs to a
workspace.
