---
id: workspace-roles-and-groups
title: Roles, permissions and directory groups
path: /workspace/roles
category: administration
tags: roles, permissions, owner, primary owner, admin, member, viewer, custom role, groups, directory group, scim groups, transfer ownership, seats
updated: 2026-09-17
scope: public
---

## The built-in roles

- **Primary Owner**: the one person who can transfer ownership, delete the
  workspace and manage its billing contract. It is not a role you assign; it
  moves by transferring ownership.
- **Owner**: everything an admin can do, plus single sign-on, directory group
  roles and other owners.
- **Admin**: manages members, roles, policy, directory sync and what is shared.
- **Member**: opens what the workspace shares, and shares their own work into
  it.
- **Viewer**: read-only. Opens what the workspace shares, and cannot share, edit
  or change settings.

## What a permission grants

Roles are built from named permissions, and the console spells each one out in
plain language: invite, remove and change members; create roles and assign them;
change workspace policy, models and connectors; give directory groups roles and
managers; manage directory sync; see and change single sign-on settings; read
the audit trail and usage; see the contract and invoices; share into the
workspace; change or withdraw anything shared; see members' workspace
conversations and projects; rename the workspace.

Three permissions belong to the Primary Owner alone and cannot be granted to
anyone else: transfer ownership, delete the workspace, and manage the billing
contract.

## Custom roles

Roles beyond the built-in five can be created and assigned. A person can hold
more than one role; where roles disagree about a restriction, the most
restrictive value wins.

## Directory groups

A group synced from your identity provider can be given a role and a manager, so
membership of the group grants access rather than each account being changed by
hand. Groups arrive through SCIM 2.0 provisioning alongside users.

## Seats

Seats are consumed by membership and are shown against the plan on the people
page. Removing a member frees the seat.
