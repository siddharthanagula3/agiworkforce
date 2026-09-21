---
id: workspace-administration
title: Administering a workspace
path: /workspace
category: administration
tags: admin, administration, workspace console, members, seats, invite, audit log, usage analytics, sharing, legal hold, retention, api keys, spend limit, create workspace, switch workspace, leave workspace, delete workspace, successor, owner
updated: 2026-09-21
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

## Creating a workspace

Settings, Workspace is where a workspace is created: give it a name, and a slug
made of lowercase letters, numbers and hyphens. Creating one needs a Team or
Enterprise plan, and on any other plan the page says so in place of the form.

An account owns one workspace at most. A second attempt is refused with "You
already own a workspace. Switch to it from the account menu." Other workspaces
are joined by invitation. A slug another workspace already uses is refused with
"That organization slug is already taken".

A new workspace starts with the seats you paid for. When the seat count cannot
be read, nothing is created: "Your purchased seats could not be verified. No
organization was created; please try again." A workspace that is created opens
straight away, and the app reloads inside it.

## Switching between workspaces

The account menu lists **Personal**, marked "Only you", and under
**Enterprise** every workspace you belong to, each with your role in it.
Settings, Workspace offers the same choice as a picker. Only a workspace you are
a member of can be selected; the server refuses any other.

Switching reloads the app inside the chosen workspace, and work in progress does
not come with you. When something would be lost, the switch names it before it
happens: an unsent message, a file still uploading, a reply still being written,
a live voice session, a browser or computer action still running, a tool waiting
for your approval, or an artifact not yet saved. **Switch anyway** goes ahead;
**Stay in this workspace** changes nothing. A switch that fails says so and
offers **Try switching again** rather than leaving you in the old workspace
without a word.

## Leaving a workspace

Settings, Workspace, **Workspace membership** is where you leave. A member
chooses **Leave workspace** and confirms, and the change is immediate: your seat
becomes available, the device tokens and API keys issued in that workspace are
revoked, and any connector you shared with the workspace is unshared. Device
tokens and API keys from your personal account are left alone. If the workspace
you leave is the one you were working in, you are signed out and sign in again
to carry on.

An owner leaves by choosing a successor first. **Transfer ownership and leave**
makes that member the owner and removes you in one operation, so the workspace
never has no owner. An owner who is the only member cannot leave; the workspace
has to be deleted instead.

## Deleting a workspace

Only the owner can delete a workspace. Settings, Workspace, **Delete this
workspace** opens the deletion page, where you confirm by typing the
workspace's name or its slug. A confirmation that matches neither schedules
nothing.

Nothing is erased on the day you ask. Deletion is scheduled 14 days ahead, and
the owner can cancel it from the same page until then; after the scheduled date
a cancellation is refused. A daily job then erases the workspace's
conversations, projects, files, connectors and API keys for every member. Two
records are kept rather than erased: billing history is anonymised, and the
workspace's audit trail stays with its reference to the workspace removed.

A workspace under an active legal hold cannot be scheduled for deletion. The
request is refused and names how many holds are active, and each one has to be
released first. A hold placed after deletion was scheduled stops the erasure
too: the workspace stays scheduled and nothing is erased while the hold lasts.

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
