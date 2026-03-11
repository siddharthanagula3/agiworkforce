# Sub-Feature: Teams

> Multi-user team collaboration with RBAC, invitation system, shared resources, activity logging, and per-team billing -- all backed by a local SQLite database with 26 Tauri IPC commands.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust feature module | `apps/desktop/src-tauri/src/features/teams/` (6 files) |
| Rust IPC commands | `apps/desktop/src-tauri/src/sys/commands/teams.rs` |
| Rust command registration | `apps/desktop/src-tauri/src/lib.rs` (lines 1261-1286) |
| DB migration | `apps/desktop/src-tauri/src/data/db/migrations.rs` (`apply_migration_v24`, lines 2674-2856) |
| TS types (desktop) | `apps/desktop/src/types/teams.ts` |
| TS types (web) | `apps/web/types/teams.ts` |
| Zustand store | `apps/desktop/src/stores/teamStore.ts` |
| React hook | `apps/desktop/src/hooks/useTeam.ts` |
| UI components | `apps/desktop/src/components/Teams/` (5 files) |
| Realtime presence | `apps/desktop/src/components/Realtime/PresenceIndicator.tsx` |
| Presence backend | `apps/desktop/src-tauri/src/integrations/realtime/presence.rs` |
| Web settings hooks | `apps/web/features/settings/hooks/use-settings-queries.ts` (team member CRUD via Supabase) |

## Architecture Overview

Teams is a fully local-first collaboration system. All data lives in the desktop app's SQLite database (migration v24 creates 6 tables). The Rust `features/teams/` module provides five manager structs, each owning an `Arc<Mutex<Connection>>`:

```
TeamManager          -- CRUD for teams, members, invitations, ownership transfer
TeamPermissions      -- Static RBAC engine (no state, pure functions)
TeamActivityManager  -- Audit log with filtering, stats, cleanup, export
TeamResourceManager  -- Share/unshare workflows, templates, automations, etc.
TeamBillingManager   -- Per-team billing with Stripe integration hooks
```

The `sys/commands/teams.rs` file wraps these managers into 26 `#[tauri::command]` functions, injecting `State<'_, AppDatabase>` for DB access. Every mutating command also logs an activity entry via `TeamActivityManager`.

On the frontend, two parallel access patterns exist:
- **`teamStore.ts`** (Zustand) -- global state with loading flags, used by `TeamDashboard` and its children
- **`useTeam.ts`** (React hook) -- standalone hook with local `loading`/`error` state, toast notifications, used for one-off operations in other components

The web app (`apps/web`) has a separate Supabase-based team system in `use-settings-queries.ts` with its own `TeamMember` type and organization-scoped queries. The web types file (`apps/web/types/teams.ts`) mirrors the desktop types for shared type safety.

### Data Flow

```
Frontend Component
    |
    v
teamStore.ts / useTeam.ts
    |  invoke('create_team', { name, description, ownerId })
    v
sys/commands/teams.rs  (#[tauri::command])
    |  TeamManager::new(db.conn.clone())
    v
features/teams/team_manager.rs  (SQLite operations)
    |  + TeamActivityManager::log_activity(...)
    v
SQLite (teams, team_members, team_invitations, team_resources, team_activity, team_billing)
```

## Database Schema (Migration v24)

Six tables, all with `FOREIGN KEY ... ON DELETE CASCADE` to the `teams` table:

### `teams`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | |
| owner_id | TEXT | NOT NULL |
| settings | TEXT | JSON blob (TeamSettings) |
| created_at | INTEGER | DEFAULT strftime('%s','now') |
| updated_at | INTEGER | DEFAULT strftime('%s','now') |

Indexes: `idx_teams_owner(owner_id)`, `idx_teams_created(created_at DESC)`

### `team_members`
| Column | Type | Constraints |
|--------|------|-------------|
| team_id | TEXT | NOT NULL, FK teams(id) CASCADE |
| user_id | TEXT | NOT NULL |
| role | TEXT | NOT NULL, CHECK('viewer','editor','admin','owner') |
| joined_at | INTEGER | DEFAULT strftime('%s','now') |
| invited_by | TEXT | |

PK: `(team_id, user_id)`. Indexes: `idx_team_members_user(user_id)`, `idx_team_members_role(role)`

### `team_invitations`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| team_id | TEXT | NOT NULL, FK teams(id) CASCADE |
| email | TEXT | NOT NULL |
| role | TEXT | NOT NULL, CHECK('viewer','editor','admin') |
| invited_by | TEXT | NOT NULL |
| token | TEXT | NOT NULL, UNIQUE |
| expires_at | INTEGER | NOT NULL |
| accepted | INTEGER | DEFAULT 0 |
| created_at | INTEGER | DEFAULT strftime('%s','now') |

Indexes: `idx_team_invitations_email(email)`, `idx_team_invitations_token(token)`, `idx_team_invitations_team(team_id, accepted)`

### `team_resources`
| Column | Type | Constraints |
|--------|------|-------------|
| team_id | TEXT | NOT NULL, FK teams(id) CASCADE |
| resource_type | TEXT | NOT NULL, CHECK('workflow','template','knowledge','automation','document','dataset') |
| resource_id | TEXT | NOT NULL |
| resource_name | TEXT | NOT NULL |
| resource_description | TEXT | |
| shared_by | TEXT | NOT NULL |
| shared_at | INTEGER | DEFAULT strftime('%s','now') |
| access_count | INTEGER | DEFAULT 0 |
| last_accessed | INTEGER | |

PK: `(team_id, resource_type, resource_id)`. Indexes: `idx_team_resources_team(team_id, shared_at DESC)`, `idx_team_resources_type(resource_type)`, `idx_team_resources_shared_by(shared_by)`

### `team_activity`
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| team_id | TEXT | NOT NULL, FK teams(id) CASCADE |
| user_id | TEXT | |
| action | TEXT | NOT NULL |
| resource_type | TEXT | |
| resource_id | TEXT | |
| metadata | TEXT | JSON blob |
| timestamp | INTEGER | DEFAULT strftime('%s','now') |

Indexes: `idx_team_activity_team(team_id, timestamp DESC)`, `idx_team_activity_user(user_id, timestamp DESC)`, `idx_team_activity_action(action)`

### `team_billing`
| Column | Type | Constraints |
|--------|------|-------------|
| team_id | TEXT | PRIMARY KEY, FK teams(id) CASCADE |
| plan_tier | TEXT | NOT NULL, CHECK('team','enterprise') |
| billing_cycle | TEXT | NOT NULL, CHECK('monthly','annual') |
| seat_count | INTEGER | NOT NULL, DEFAULT 1 |
| stripe_subscription_id | TEXT | |
| usage_metrics | TEXT | JSON blob (UsageMetrics) |
| next_billing_date | INTEGER | |
| current_period_start | INTEGER | |
| current_period_end | INTEGER | |

Indexes: `idx_team_billing_subscription(stripe_subscription_id)`, `idx_team_billing_next_date(next_billing_date)`

## Rust Commands (IPC)

All 26 commands registered in `lib.rs` lines 1261-1286. Each takes `State<'_, AppDatabase>`.

### Team CRUD (6 commands)
| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `create_team` | name, description?, ownerId | `Team` | Creates team + adds owner as member |
| `get_team` | teamId | `Option<Team>` | Fetch by ID |
| `update_team` | teamId, name?, description? | `()` | Update basic info |
| `update_team_settings` | teamId, defaultMemberRole?, allowResourceSharing?, requireApprovalForAutomations?, enableActivityNotifications?, maxMembers? | `()` | Merge-update settings JSON |
| `delete_team` | teamId | `()` | Cascade deletes all related data |
| `get_user_teams` | userId | `Vec<Team>` | All teams a user belongs to |

### Member Management (6 commands)
| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `invite_member` | teamId, email, role, invitedBy | `String` (token) | Creates invitation, logs activity |
| `accept_invitation` | token, userId | `Team` | Validates expiry/used, adds member, logs activity |
| `remove_member` | teamId, userId, removedBy | `()` | Cannot remove owner, logs activity |
| `update_member_role` | teamId, userId, role, updatedBy | `()` | Cannot assign owner role directly, logs activity |
| `get_team_members` | teamId | `Vec<TeamMember>` | Ordered by joined_at ASC |
| `get_team_invitations` | teamId | `Vec<TeamInvitation>` | Pending (unaccepted) only |

### Resource Sharing (4 commands)
| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `share_resource` | teamId, resourceType, resourceId, resourceName, resourceDescription?, sharedBy | `()` | Prevents duplicates, logs activity |
| `unshare_resource` | teamId, resourceType, resourceId, unsharedBy | `()` | Logs activity |
| `get_team_resources` | teamId | `Vec<TeamResource>` | All resources, ordered by shared_at DESC |
| `get_team_resources_by_type` | teamId, resourceType | `Vec<TeamResource>` | Filter by type |

### Activity (2 commands)
| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `get_team_activity` | teamId, limit, offset | `Vec<TeamActivity>` | Paginated, newest first |
| `get_user_team_activity` | teamId, userId, limit | `Vec<TeamActivity>` | Per-user filter |

### Billing (7 commands)
| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `get_team_billing` | teamId | `Option<TeamBilling>` | Current billing state |
| `initialize_team_billing` | teamId, plan, cycle, seatCount | `TeamBilling` | Sets up billing record, logs activity |
| `update_team_plan` | teamId, plan, updatedBy | `()` | Validates seat count fits new plan |
| `add_team_seats` | teamId, count, updatedBy | `()` | Checks max_seats limit |
| `remove_team_seats` | teamId, count, updatedBy | `()` | Cannot go below current member count |
| `calculate_team_cost` | teamId | `f64` | price_per_seat * seats * cycle_discount |
| `update_team_usage` | teamId, metrics (UsageMetrics) | `()` | Bulk update usage metrics |

### Ownership (1 command)
| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `transfer_team_ownership` | teamId, newOwnerId, transferredBy | `()` | Demotes old owner to admin, promotes new owner, updates teams.owner_id |

### Related (1 command, in realtime module)
| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `get_team_presence` | teamId | `Vec<UserPresence>` | Online team members via realtime presence system |

## Store Schema

### `teamStore.ts` (Zustand, no persist)

```typescript
interface TeamState {
  // Data
  currentTeam: Team | null;
  teams: Team[];
  members: TeamMember[];
  invitations: TeamInvitation[];
  resources: TeamResource[];
  activities: TeamActivity[];
  billing: TeamBilling | null;

  // Loading flags (granular per section)
  isLoading: boolean;            // team CRUD
  isLoadingMembers: boolean;     // members + invitations
  isLoadingResources: boolean;   // resources
  isLoadingActivities: boolean;  // activity log
  isLoadingBilling: boolean;     // billing

  error: string | null;

  // 22 action methods (1:1 with IPC commands + setCurrentTeam, clearError, reset)
}
```

Pattern: Each action sets the appropriate loading flag, calls `invoke()`, updates state on success, catches errors into `error`. Mutating actions (invite, remove, update role, share, unshare, billing changes) auto-refresh their section's data after success.

### `useTeam.ts` (React hook, local state)

Provides the same operations as the store but with:
- Local `loading` / `error` state (not shared)
- `toast.success()` / `toast.error()` notifications via Sonner
- `useCallback` memoization on all methods
- Accepts `TeamRole | string` for flexibility

## Component Tree

```
TeamDashboard
├── Header (team name, description, team selector dropdown)
├── Tab Bar (Members | Invitations | Settings | Activity | Billing)
├── Error banner (dismissible)
└── Tab Content
    ├── TeamMemberList (table with role badges, inline role editing, remove)
    ├── TeamInvitation (invite form + pending invitations table + copy link)
    ├── TeamSettings (basic info form + toggles + danger zone delete)
    ├── TeamActivityLog (timeline with icons, colors, expandable metadata)
    └── Billing panel (inline in TeamDashboard, displays plan/cycle/seats/next date)

PresenceIndicator (standalone, used wherever team presence is needed)
```

### Component Details

| Component | File | Key Dependencies |
|-----------|------|-----------------|
| `TeamDashboard` | `components/Teams/TeamDashboard.tsx` | `useTeamStore`, all child components |
| `TeamMemberList` | `components/Teams/TeamMemberList.tsx` | `useTeamStore`, `useAuthStore`, `hasPermission`, `canModifyRole`, `canRemoveRole` from types |
| `TeamInvitation` | `components/Teams/TeamInvitation.tsx` | `useTeamStore`, `useAuthStore`, `validateUrl` from security utils |
| `TeamSettings` | `components/Teams/TeamSettings.tsx` | `useTeamStore` |
| `TeamActivityLog` | `components/Teams/TeamActivityLog.tsx` | Pure presentational, receives `activities` prop |
| `PresenceIndicator` | `components/Realtime/PresenceIndicator.tsx` | `invoke('get_team_presence')`, `websocketClient` |

## Key Patterns

### 1. Four-Tier RBAC (Owner > Admin > Editor > Viewer)

Permissions are enforced at two layers:

**Rust (`team_permissions.rs`)**: Static `TeamPermissions` struct with 26 granular permissions across 6 categories (Resources, Members, Team Settings, Automations, Workflows, Billing/Activity). Pure functions, no state.

**TypeScript (`types/teams.ts`)**: Mirror implementation with `getRolePermissions()`, `hasPermission()`, `canModifyRole()`, `canRemoveRole()`. Used in components for conditional UI rendering.

Permission matrix summary:

| Permission Category | Owner | Admin | Editor | Viewer |
|---------------------|-------|-------|--------|--------|
| View resources/members/settings | Yes | Yes | Yes | Yes |
| Create/modify resources | Yes | Yes | Yes | No |
| Delete resources | Yes | Yes | No | No |
| Invite/remove members | Yes | Yes | No | No |
| Modify member roles | Yes | Yes (not Owner) | No | No |
| Modify team settings | Yes | Yes | No | No |
| Delete team | Yes | No | No | No |
| Manage billing | Yes | No | No | No |
| Run automations/workflows | Yes | Yes | Yes | No |
| Export activity | Yes | Yes | No | No |

### 2. Invitation System

- UUID v4 tokens with 7-day expiry
- Token-based acceptance (stateless link sharing)
- Invitations stored in `team_invitations` with `accepted` flag
- Frontend generates invite URLs: `${origin}/accept-invitation?token=...`
- URL sanitized via `validateUrl()` before clipboard copy
- Only pending (unaccepted) invitations returned by `get_team_invitations`

### 3. Team Billing

Two plans with seat-based pricing:

| Plan | Price/Seat/Month | Included Seats | Max Seats | Key Features |
|------|------------------|----------------|-----------|--------------|
| Team | $29 | 5 | 50 | Shared workflows, activity logs, basic support |
| Enterprise | $99 | 10 | Unlimited | SSO/SAML, priority support, custom integrations, dedicated AM |

- Annual billing: 20% discount (0.8x multiplier)
- Seat management validates against plan limits and current member count
- `stripe_subscription_id` field for Stripe integration (stored but not yet wired to live Stripe API)
- Usage metrics tracked: workflow executions, automation runs, API calls, storage, compute hours, LLM tokens

### 4. Activity Logging

Every mutating team command automatically logs an activity entry with:
- Actor user ID
- Activity type (23 enum variants covering members, resources, workflows, automations, settings, billing)
- Optional resource type/ID
- Optional JSON metadata (e.g., `{ "email": "...", "role": "editor" }`)

Backend supports: pagination, per-user filtering, type filtering, time-range queries, stats aggregation (total activities, active users, 24h count, most active user), cleanup of old entries, and JSON export.

### 5. Shared Resources

Six resource types: Workflow, Template, Knowledge, Automation, Document, Dataset. Resources are shared by reference (resource_id), not copied. Access tracking counts views and records last access time. Search by name/description is supported. Stats endpoint provides per-type counts.

### 6. Web App Team System (Separate Implementation)

The web app (`apps/web`) has its own Supabase-based team management:
- `use-settings-queries.ts` provides `useTeamMembers`, `useInviteTeamMember`, `useRemoveTeamMember`, `useUpdateTeamMemberRole`
- Queries Supabase `organization_members` table (different schema from desktop)
- React Query for caching (5min stale, 15min GC)
- Web `TeamMember` type has different shape: includes `organizationId`, `email`, `name`, `avatarUrl`, `status` ('active'|'pending'|'suspended')
- Types file at `apps/web/types/teams.ts` mirrors desktop types for potential future convergence

## Known Issues / Tech Debt

1. **Dual team implementations**: Desktop (SQLite, local) and web (Supabase, cloud) are completely separate systems with different schemas and no synchronization. This will need unification for cross-platform team management.

2. **No server-side permission enforcement**: RBAC is only checked on the frontend (TS utility functions). The Rust commands do not validate that the caller has permission for the operation -- any authenticated user can invoke any team command if they know the team ID.

3. **Stripe integration is a stub**: `stripe_subscription_id` is stored but no actual Stripe API calls exist. Billing is calculated locally but never charged.

4. **`get_user_teams` SQL has a typo**: Line 250 of `team_manager.rs` has `t.updated_a` (truncated column name), which should be `t.updated_at`. This will cause a runtime SQL error when querying user teams.

5. **TeamSettings toggles in `TeamSettings.tsx` are not persisted**: The component tracks toggle state locally but the `handleSave` only calls `updateTeam` (name/description). It never calls `update_team_settings` with the toggle values, so changes to resource sharing, automation approval, and notification settings are lost on save.

6. **`useTeam.ts` uses raw `@tauri-apps/api/core` import**: Line 10 imports directly from `@tauri-apps/api/core` instead of using the `tauri-mock` shim, which will break in web/test environments.

7. **No pagination UI for activity log**: Backend supports pagination (`limit`/`offset`) but `TeamActivityLog` component receives all activities as a flat array with no load-more or infinite scroll.

8. **Invitation email delivery not implemented**: Invitations create tokens but there is no email sending -- users must manually copy and share the invite link.

9. **`delete_team` has no cascading cleanup beyond SQLite**: The CASCADE foreign keys handle DB cleanup, but there is no cleanup of shared resources' actual content, no notification to removed members, and no Stripe subscription cancellation.

10. **Presence is team-scoped but not filtered**: `get_team_presence` in `presence.rs` ignores the `team_id` parameter and returns all online users (`self.online_users.lock().await.values().cloned().collect()`).

11. **No Supabase migration for teams**: The web app's team hooks query `organization_members` but no Supabase migration in the `supabase/migrations/` directory creates team-specific tables.

12. **`TeamMemberList` shows user IDs, not names**: The member list displays raw `user_id` strings and first-two-character avatars because there is no user profile resolution.
