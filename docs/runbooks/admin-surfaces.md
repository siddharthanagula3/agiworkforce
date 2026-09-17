# Admin surfaces

Status: Current
Owner: Platform lead
Last updated: 2026-09-17

The three administrative surfaces in `apps/web`, who each one admits, and what
can be done from it. Read this before granting anyone access to any of them: two
of the three look similar and admit entirely different populations.

## The three surfaces

| Route                    | Admits                                        | Scope                            |
| ------------------------ | --------------------------------------------- | -------------------------------- |
| `/settings`              | any signed-in user                            | their own account                |
| `/admin`                 | a platform operator on the allowlist          | platform-wide readiness controls |
| `/operator`              | a platform operator on the allowlist          | every account on the platform    |

There is a fourth population that is easy to confuse with the second and third:
an **organisation** owner or admin. `hasAdminConsoleAccess` in
`apps/web/features/admin/lib/admin-console-access.ts` passes for any Clerk user
whose `publicMetadata.role` is `owner` or `admin`. That is a customer's own role
over their own organisation, held by any customer who created one. It is not
platform access, and it must never be treated as such.

## Who is a platform operator

`apps/web/features/admin/lib/platform-admin-access.ts` is the only answer.
Access is an allowlist of Clerk user ids in `AGI_PLATFORM_ADMIN_USER_IDS`,
comma separated.

Three properties of that gate matter operationally:

- **Ids, not email addresses.** An email can be changed at the identity provider
  by whoever controls the mailbox, which would make the gate only as strong as
  that mailbox.
- **An unset variable denies everyone.** There is no implicit operator. Losing the
  variable locks the platform team out rather than opening the surface up, which
  is the correct direction for a surface that can mutate billing state.
- **The page rendering is not the authorisation.** Every API route behind these
  pages checks the same allowlist again. A page that renders for someone who
  should not see it is a bug to report, not access they have.

### Granting and revoking

Adding an operator is an environment change, not a database change: add the Clerk
user id to `AGI_PLATFORM_ADMIN_USER_IDS` in the deployment environment and
redeploy. Removing one is the same edit in reverse, and takes effect on the next
request the process serves, because the value is read per request rather than
cached at boot.

Grant it to the smallest set that can run the platform. Everything behind
`/operator` reads every account.

## What is on `/admin`

`apps/web/features/admin/pages/AdminConsolePage.tsx`. The enterprise readiness
console: teams, policy, identity, auditability and support posture, plus two live
panels that act rather than report.

| Panel                        | Does                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| `SecurityOperationsPanel`    | platform security telemetry and account action             |
| `ContentReportQueuePanel`    | the trust and safety report queue                          |

## What is on `/operator`

`apps/web/features/admin/pages/OperatorDashboardPage.tsx`. Fourteen tabs, each
addressable by location hash so a link can land on a control rather than on the
overview: `overview`, `feedback`, `users`, `costs`, `routing`, `rollout`,
`flags`, `services`, `routes`, `economics`, `content`, `privacy`, `support`,
`jobs`.

| Tab         | Panel                     | What it is for                                      |
| ----------- | ------------------------- | ---------------------------------------------------- |
| `costs`     | `OperatorCostsPanel`      | spend against providers                              |
| `routing`   | `RoutingHealthPanel`      | route health and breaker state                       |
| `rollout`   | `ModelRolloutPanel`       | staged model rollout                                 |
| `flags`     | `FeatureFlagsPanel`       | feature flag state                                   |
| `services`  | `ServiceHealthPanel`      | dependency health                                    |
| `routes`    | `RouteEconomicsPanel`     | per-route cost and margin                            |
| `economics` | `EconomicsSummaryPanel`   | the aggregate economic picture                       |
| `content`   | `ContentTakedownPanel`    | content takedown                                     |
| `privacy`   | `PrivacyRequestsPanel`    | data subject access and erasure requests             |
| `support`   | `SupportHandoffQueuePanel`| the support handoff queue                            |
| `jobs`      | `BackgroundJobsPanel`     | background job state                                 |

`/operator` deliberately does not sit under `/admin`. That tree's layout admits
an organisation owner or admin, and nesting the operator dashboard inside it
would have handed the platform's own books to any customer admin. It would also
have bounced a platform operator who holds no organisation role, which is the
normal case for whoever runs the platform.

## Rules for acting from these surfaces

- **An action a user cannot undo asks first, and the question names the
  consequence.** `useConfirmAction` in `@agiworkforce/ui` is that surface. This
  is `AGENTS.md` section 9 and it is not optional on an operator control.
- **Privacy requests are legally timed.** The `privacy` tab is the working queue
  for data subject requests; the procedure and the clock are in
  `docs/compliance/`, not here.
- **A takedown and a ban are logged.** Every action from these panels writes an
  audit event. When an action appears not to have been recorded, treat that as an
  incident rather than as a missing feature, and follow
  `docs/runbooks/incident-response.md`.
- **An organisation locked out of its own policy** is a different procedure:
  `docs/runbooks/organization-policy-lockout.md`.
