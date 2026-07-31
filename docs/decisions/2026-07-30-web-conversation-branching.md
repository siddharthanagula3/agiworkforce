# Persist Web Conversation Branches as Owner-Scoped Conversation Copies

Status: Accepted

Date: 2026-07-30

Owners: Web chat and managed-cloud persistence

## Context

The shared `BranchNavigator` was implemented but no live Web host mounted it.
Web regeneration and edit flows intentionally replace later transcript turns,
so they cannot also serve as durable, separately navigable branches. The Neon
schema contained a `conversation_branches` relation, but it had no request
contract, runtime owner, idempotency key, row-level policy, or mapping between
the source message ids and the copied target message ids.

A Web branch must preserve the conversation up to one chosen message, remain a
normal conversation that every existing chat reader can open, survive reloads,
and never expose another user's conversation or fork point.

## Decision

Web branches are persisted as new managed-cloud conversations plus an
owner-scoped relation to the source conversation and fork-point message. A
client-generated UUID is both the target conversation id and the idempotency
key. Creation runs in one database transaction after explicit owner checks,
copies all persisted message content and accounting fields through the chosen
fork point, and records source-to-target message ids in a relational mapping
table. The source conversation row is locked for the capacity check and branch
write so concurrent requests cannot race past the per-fork limits.

The API lists only the direct parent/sibling group relevant to the displayed
conversation. The Web transcript mounts the shared pure `BranchNavigator`
beside the mapped fork-point message and navigates using normal conversation
routes. Branch creation is CSRF-protected, rate-limited, bounded per fork and
per conversation, exposes an in-flight state, and reports failures without
destructively changing the source transcript.

Both branch tables force RLS. Insert policy checks the authenticated owner of
the source and target conversations; the message-map policy also verifies that
both mapped messages belong to those exact conversations.

## Consequences

Web users can create, reload, and switch durable conversation branches without
inventing a second transcript format. Existing conversation persistence,
project association, temporary-chat privacy, and model selection continue to
apply to the copied branch.

The first runtime intentionally supports direct sibling navigation rather than
an arbitrary graph browser. Mobile still needs a real persisted branch
relation and selected-message fork before the multi-surface capability can be
closed.
