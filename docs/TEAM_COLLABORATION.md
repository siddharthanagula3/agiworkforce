# Team Collaboration Guide

AGI Workforce team collaboration enables multiple users to work together on automation workflows, share resources, and manage team billing. This guide covers all aspects of team collaboration.

## Table of Contents

- [Overview](#overview)
- [Creating a Team](#creating-a-team)
- [Managing Members](#managing-members)
- [Role Permissions](#role-permissions)
- [Sharing Resources](#sharing-resources)
- [Team Billing](#team-billing)
- [Activity Tracking](#activity-tracking)
- [Best Practices](#best-practices)

## Overview

Team collaboration in AGI Workforce provides:

- **Team Workspaces**: Isolated environments for team members
- **Role-Based Access Control**: Four roles with granular permissions
- **Resource Sharing**: Share workflows, automations, templates, and more
- **Activity Logging**: Track all team actions and changes
- **Team Billing**: Centralized billing with seat-based pricing
- **Member Management**: Invite, remove, and manage team members

## Creating a Team

### From the UI

1. Navigate to **Settings > Teams**
2. Click **Create New Team**
3. Enter team details:
   - **Name**: Your team's name
   - **Description**: Optional description
4. Click **Create Team**

You will automatically become the team owner.

### Programmatically

```typescript
import { useTeamStore } from '@/stores/teamStore';

const teamStore = useTeamStore();

const team = await teamStore.createTeam(
  'Engineering Team',
  'Our main engineering team',
  currentUserId,
);
```

## Managing Members

### Inviting Members

Team Admins and Owners can invite new members:

1. Go to **Team Settings > Members**
2. Click **Invite Member**
3. Enter:
   - **Email**: Member's email address
   - **Role**: Viewer, Editor, or Admin
4. Click **Send Invitation**

The invitee will receive an invitation token via email.

### Accepting Invitations

To accept a team invitation:

1. Open the invitation link
2. Log in to AGI Workforce
3. Click **Accept Invitation**

You will be added to the team with the specified role.

### Removing Members

Team Admins and Owners can remove members:

1. Go to **Team Settings > Members**
2. Find the member to remove
3. Click the **Remove** button
4. Confirm removal

**Note:** Team owners cannot be removed. Transfer ownership first if needed.

### Changing Member Roles

Admins and Owners can change member roles:

1. Go to **Team Settings > Members**
2. Find the member
3. Select a new role from the dropdown
4. Click **Update Role**

**Restrictions:**

- Admins cannot promote members to Owner
- Admins cannot change Owner roles
- Only Owners can promote to Admin

### Transferring Ownership

Only the current owner can transfer team ownership:

1. Go to **Team Settings > Members**
2. Find the new owner
3. Click **Transfer Ownership**
4. Confirm the transfer

After transfer, you become an Admin.

## Role Permissions

AGI Workforce uses a four-tier role system:

### Viewer

**Purpose:** Read-only access for observers and stakeholders

**Permissions:**

- View all team resources
- View team members
- View team settings (read-only)
- View automations and workflows
- View activity logs

**Cannot:**

- Create or modify resources
- Run automations
- Invite or remove members
- Change settings

### Editor

**Purpose:** Day-to-day team contributors

**Permissions:**

- All Viewer permissions
- Create and modify resources
- Share resources with team
- Run automations and workflows
- Create new workflows and automations

**Cannot:**

- Delete resources
- Invite or remove members
- Modify team settings
- View or manage billing

### Admin

**Purpose:** Team managers with full resource control

**Permissions:**

- All Editor permissions
- Delete resources
- Invite and remove members (Editors and Viewers only)
- Change member roles (except Owner)
- Modify team settings
- View billing information
- Export activity logs

**Cannot:**

- Delete the team
- Manage billing subscriptions
- Remove or demote the Owner

### Owner

**Purpose:** Team creator with ultimate control

**Permissions:**

- All Admin permissions
- Manage billing and subscriptions
- Delete the team
- Transfer ownership
- Remove Admins

**Restrictions:**

- Each team has exactly one Owner
- Ownership can only be transferred, not removed

## Sharing Resources

Teams can share various resource types:

- **Workflows**: Automated process definitions
- **Automations**: UI automation scripts
- **Templates**: Reusable agent templates
- **Knowledge**: Knowledge base entries
- **Documents**: Shared documents
- **Datasets**: Data collections

### Sharing a Resource

```typescript
import { useTeamStore } from '@/stores/teamStore';

const teamStore = useTeamStore();

await teamStore.shareResource(
  teamId,
  'workflow', // Resource type
  workflowId, // Resource ID
  'Invoice Processing Workflow', // Resource name
  'Automated invoice processing and approval', // Description
  currentUserId, // Shared by
);
```

### Unsharing a Resource

```typescript
await teamStore.unshareResource(teamId, 'workflow', workflowId, currentUserId);
```

### Viewing Team Resources

```typescript
// Get all resources
const resources = await teamStore.getTeamResources(teamId);

// Get resources by type
const workflows = await teamStore.getTeamResourcesByType(teamId, 'workflow');
```

## Team Billing

AGI Workforce offers two team plans:

### Team Plan

- **Price:** $29/seat/month
- **Included Seats:** 5
- **Max Seats:** 50
- **Annual Discount:** 20% off ($278.40/year per seat)

**Features:**

- Up to 50 team members
- Shared workflows and automations
- Team activity logs
- Basic support
- API access

### Enterprise Plan

- **Price:** $99/seat/month
- **Included Seats:** 10
- **Max Seats:** Unlimited
- **Annual Discount:** 20% off ($950.40/year per seat)

**Features:**

- Unlimited team members
- Advanced security features
- Priority support
- Custom integrations
- SSO and SAML
- Advanced analytics
- Dedicated account manager

### Initializing Billing

When creating a team, initialize billing:

```typescript
const billing = await teamStore.initializeTeamBilling(
  teamId,
  'team', // 'team' or 'enterprise'
  'monthly', // 'monthly' or 'annual'
  10, // Initial seat count
);
```

### Managing Seats

Add or remove seats as your team grows:

```typescript
// Add 5 seats
await teamStore.addTeamSeats(teamId, 5, currentUserId);

// Remove 2 seats
await teamStore.removeTeamSeats(teamId, 2, currentUserId);
```

**Note:** You cannot reduce seats below the current member count.

### Calculating Costs

```typescript
const monthlyCost = await teamStore.calculateTeamCost(teamId);
```

**Formula:**

- Monthly: `seats × price_per_seat × discount`
- Annual: `seats × price_per_seat × discount × 12`

## Activity Tracking

All team actions are logged for audit and compliance:

### Activity Types

- Member events (joined, left, role changed, invited)
- Resource events (shared, unshared, accessed, modified, deleted)
- Workflow events (created, executed, modified, deleted)
- Automation events (created, executed, modified, deleted)
- Settings changes
- Billing changes (plan changed, seats added/removed)

### Viewing Activity

```typescript
// Get recent activity (paginated)
const activities = await teamStore.getTeamActivity(teamId, 50, 0);

// Get specific user's activity
const userActivities = await teamStore.getUserTeamActivity(teamId, userId, 50);
```

### Activity Log Format

```typescript
{
  id: string;
  teamId: string;
  userId: string | null;
  action: ActivityType;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, any> | null;
  timestamp: number;
}
```

## Best Practices

### Team Organization

1. **Use descriptive team names** that reflect the team's purpose
2. **Set clear descriptions** to help members understand the team's scope
3. **Start with fewer seats** and add more as needed
4. **Use role hierarchy** properly: Viewers for observers, Editors for contributors, Admins for managers

### Member Management

1. **Invite members with appropriate roles** - don't over-privilege
2. **Review team members regularly** and remove inactive members
3. **Use email invitations** instead of sharing credentials
4. **Transfer ownership** before the original owner leaves
5. **Document role responsibilities** in your team's wiki

### Resource Sharing

1. **Share only necessary resources** with the team
2. **Use clear naming conventions** for shared resources
3. **Add descriptions** to help team members understand resources
4. **Regularly audit shared resources** and unshare unused items
5. **Version control workflows** before sharing major changes

### Security

1. **Enable approval requirements** for automations in team settings
2. **Review activity logs regularly** for suspicious actions
3. **Limit Admin and Owner roles** to trusted members
4. **Use strong authentication** for all team members
5. **Implement SSO** (Enterprise plan) for centralized access control

### Billing Management

1. **Monitor seat usage** to avoid unexpected costs
2. **Choose annual billing** for 20% savings
3. **Right-size your plan** - don't over-provision
4. **Track usage metrics** to optimize resource consumption
5. **Set up budget alerts** for team spending

### Workflow Optimization

1. **Standardize workflows** across the team
2. **Create reusable templates** for common tasks
3. **Document complex workflows** with clear descriptions
4. **Test workflows** before sharing with the team
5. **Version control** important workflows externally

## API Reference

For programmatic team management, see:

- `/apps/desktop/src/stores/teamStore.ts` - Zustand store
- `/apps/desktop/src/types/teams.ts` - TypeScript types
- `/apps/desktop/src-tauri/src/commands/teams.rs` - Tauri commands

## Troubleshooting

### Cannot Invite Members

- **Check your role**: Only Admins and Owners can invite
- **Check seat limit**: Ensure available seats exist
- **Check email format**: Use valid email addresses

### Cannot Remove Member

- **Check role**: Admins cannot remove Owners or other Admins
- **Transfer ownership first**: If removing the Owner

### Cannot Share Resource

- **Check permissions**: Editors and above can share
- **Check team settings**: `allowResourceSharing` must be enabled
- **Resource already shared**: Unshare first, then re-share

### Billing Issues

- **Seat count too low**: Cannot reduce below member count
- **Plan limit reached**: Team plan maxes at 50 seats, upgrade to Enterprise
- **Payment failed**: Update payment method in billing settings

## Support

For additional help:

- **Documentation**: https://docs.agiworkforce.com/teams
- **Support Email**: support@agiworkforce.com
- **Enterprise Support**: Available with Enterprise plan

## Related Documentation

- [Authentication Guide](./AUTHENTICATION.md)
- [Billing and Subscriptions](./BILLING.md)
- [API Reference](./API_REFERENCE.md)
- [Security Best Practices](./SECURITY.md)
