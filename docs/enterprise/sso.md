# Enterprise SSO (SAML 2.0 / OIDC)

Status: Current
Owner: Platform lead
Last updated: 2026-08-04
Purpose: how enterprise single sign-on is implemented, what an administrator has to do on the identity-provider side, and exactly what is and is not proven to work today.

## Scope and trust boundary

SSO is a **managed-cloud, Enterprise-tier** control. It is entitled through
`canUseBillingPlanCapability(plan, 'enterprise_controls')` and must never appear
in a Local or BYOK path. Every route below is server-only and gated on that
capability before it reads or writes anything.

## Implementation: Clerk enterprise connections

The product's authentication is Clerk. Clerk implements SAML 2.0 and OIDC
enterprise connections, so **AGI does not implement SAML itself**. Validated
configuration is forwarded to Clerk via
`clerkClient().enterpriseConnections`; Clerk parses IdP metadata, validates
assertions, and performs just-in-time user creation.

This is a deliberate security decision. Hand-rolling a SAML service provider
means owning XML signature verification, canonicalisation, and assertion replay
defence — a large, high-severity attack surface with no product benefit.

What AGI stores locally is only the _configuration record and the reference_:

| Column (`public.sso_connections`)                 | Meaning                                                       |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `clerk_connection_id`                             | The provisioned Clerk connection. Never returned to a client. |
| `metadata_url`, `metadata_xml`                    | SAML IdP metadata, forwarded to Clerk.                        |
| `oidc_discovery_url`, `oidc_client_id`            | OIDC configuration, forwarded to Clerk.                       |
| `acs_url`, `sp_entity_id`, `sp_metadata_url`      | Values Clerk returns that the admin pastes into their IdP.    |
| `domain_verified_at`, `domain_verification_token` | DNS ownership proof.                                          |

**The OIDC client secret is never stored.** It is supplied on the request that
provisions or re-provisions the connection, forwarded to Clerk, and discarded.
There is deliberately no `oidc_client_secret` column.

Schema: `apps/web/db/neon/0076_enterprise_control_plane_tables.sql` (original
table) and `apps/web/db/neon/0083_sso_connections_clerk_link.sql` (provider
link, domain verification, dormant-by-default, and the constraint that an
active row must be both verified and provisioned).

## Domain verification is mandatory

This deployment does **not** use Clerk Organizations — tenancy is AGI's own
`organizations` / `organization_members` tables. Clerk enterprise connections
are therefore created **instance-level**, which means a connection routes
**every** sign-in whose email domain matches, across the whole product.

Consequence: an unverified domain claim is an authentication-takeover vector,
not a data-quality problem. Without verification, an owner of any organization
could claim a domain they do not control and capture its users' sign-ins.

Verification is enforced in three independent places:

1. `POST /api/admin/sso/verify-domain` must succeed before activation.
2. `PATCH /api/admin/sso/[id]` refuses `is_active: true` with `409
DOMAIN_NOT_VERIFIED` when `domain_verified_at` is null.
3. A database check constraint refuses to store an active row that is not both
   verified and provisioned.

Public mailbox providers (`gmail.com`, `outlook.com`, `yahoo.com`, and others)
are refused outright and cannot be claimed at all.

### The DNS challenge

Creating a connection returns a TXT record to publish:

```
Type:  TXT
Name:  _agiworkforce-sso.<your-domain>
Value: agiworkforce-sso-verification=<token>
```

Publish it, then call verification. The token is compared in constant time and
cleared once verification succeeds, so a record left in DNS cannot be reused to
re-claim the domain later.

## Administrator flow

1. **Create the connection** — Settings → Team → _Single sign-on_, or
   `POST /api/admin/sso`. Requires organization **owner**. The connection is
   created dormant; nothing is sent to Clerk and no sign-in is affected.
2. **Verify the domain** — publish the TXT record, then _Verify domain_
   (`POST /api/admin/sso/verify-domain`).
3. **Activate** — _Activate_ (`PATCH /api/admin/sso/[id]` with
   `is_active: true`). This is when the connection is registered with Clerk.
   The response contains the ACS URL, SP entity ID, and SP metadata URL.
4. **Finish on the IdP side** — paste those values into the IdP (below).
5. **Rotate as needed** — `PATCH /api/admin/sso/[id]` with a new
   `metadata_url` / `metadata_xml` updates the existing Clerk connection in
   place. Certificate rotation does not require recreating the connection.

Organization **admins** can read connections; only **owners** can create,
modify, verify, activate, or remove them.

## Identity-provider setup

You will need the **ACS URL** and **SP entity ID** from step 3 above. They are
generated by Clerk when the connection is provisioned, so create and activate
the AGI connection first.

### Okta

1. Okta Admin → **Applications** → **Create App Integration** → **SAML 2.0**.
2. _Single sign-on URL_ = the **ACS URL**. Leave "Use this for Recipient URL and
   Destination URL" checked.
3. _Audience URI (SP Entity ID)_ = the **SP entity ID**.
4. _Name ID format_ = `EmailAddress`; _Application username_ = `Email`.
5. Attribute statements — map at least:
   - `email` → `user.email`
   - `firstName` → `user.firstName`
   - `lastName` → `user.lastName`
6. Finish, then open **Sign On** → **View SAML setup instructions** and copy the
   **Identity Provider metadata** URL. Supply it to AGI as `metadata_url`.
7. Assign the application to the users and groups who should use SSO.

### Microsoft Entra ID (formerly Azure AD)

1. Entra admin centre → **Enterprise applications** → **New application** →
   **Create your own application** → _Integrate any other application_.
2. **Single sign-on** → **SAML**.
3. _Identifier (Entity ID)_ = the **SP entity ID**.
4. _Reply URL (Assertion Consumer Service URL)_ = the **ACS URL**.
5. Under **Attributes & Claims**, confirm the unique user identifier is
   `user.mail` (not `user.userprincipalname` unless those match), and that
   `emailaddress`, `givenname`, and `surname` claims are present.
6. Copy the **App Federation Metadata Url** and supply it to AGI as
   `metadata_url`.
7. Assign users and groups under **Users and groups**.

### Google Workspace

1. Google Admin console → **Apps** → **Web and mobile apps** → **Add app** →
   **Add custom SAML app**.
2. On the _Google Identity Provider details_ screen, copy the **SSO URL**,
   **Entity ID**, and download the **certificate** — or, simpler, copy the
   **metadata URL** and supply it to AGI as `metadata_url`.
3. _ACS URL_ = the **ACS URL**; _Entity ID_ = the **SP entity ID**.
4. _Name ID format_ = `EMAIL`; _Name ID_ = `Basic Information > Primary email`.
5. Attribute mapping — map `Primary email` → `email`, `First name` →
   `firstName`, `Last name` → `lastName`.
6. Turn the app **ON for everyone** (or for the relevant organizational units).

### OIDC (any compliant provider)

Supply `oidc_discovery_url` (the `.well-known/openid-configuration` URL),
`oidc_client_id`, and — on the request that activates the connection —
`oidc_client_secret`. The secret is forwarded to Clerk and not stored by AGI.
Register Clerk's callback URL with your provider; it is shown in the Clerk
dashboard for the connection.

## Input handling

IdP metadata and administrator input are treated as hostile
(`apps/web/lib/server/sso/idp-metadata.ts`):

- **URLs** must be `https`, on the default port, without embedded credentials,
  and must not name a loopback, RFC1918, CGNAT, link-local, cloud-metadata, or
  `.internal` / `.local` host. This blocks SSRF through metadata and discovery
  URLs.
- **Metadata XML** is size-capped, rejected if it declares a `DOCTYPE` or an
  entity (XXE and entity-expansion payloads), and must contain an
  `EntityDescriptor`. **AGI never parses it** — Clerk does.
- **Attribute mappings** are allowlisted to exactly `userId`, `emailAddress`,
  `firstName`, `lastName`, validated against the raw request body so a stripped
  key such as `__proto__` is refused rather than silently dropped.
- **Domains** must be well-formed FQDNs and must not be public mailbox
  providers.
- IdP metadata, certificates, and client secrets are never logged.

## Known blocker: Clerk plan entitlement

Clerk enterprise connections require a **paid Clerk plan with the Enhanced
Authentication add-on**. The repository proves the SDK surface exists
(`@clerk/backend` 3.4.13 exposes `enterpriseConnections` with full SAML and
OIDC parameter sets) but **cannot prove this deployment's Clerk instance is
entitled**, and no live connection has been created against the real instance.

The code degrades honestly rather than silently:

- Missing `CLERK_SECRET_KEY` → `503` with `code: "missing_credentials"`.
- Clerk answers `402`/`403` → `503` with `code: "not_entitled"` and a message
  naming the Enhanced Authentication add-on.

Until a connection has been created against the live Clerk instance, the
marketing claim should be described as _available on enterprise contracts_
rather than as verified in production. See
`docs/agent-context/known-flaws.md`.

## API reference

| Method   | Route                          | Role         | Purpose                                     |
| -------- | ------------------------------ | ------------ | ------------------------------------------- |
| `GET`    | `/api/admin/sso`               | owner, admin | List connections for administered orgs      |
| `GET`    | `/api/admin/sso?orgId=`        | owner, admin | List one org's connections                  |
| `POST`   | `/api/admin/sso`               | owner        | Create a dormant connection + DNS challenge |
| `GET`    | `/api/admin/sso/[id]`          | owner, admin | Read one connection                         |
| `PATCH`  | `/api/admin/sso/[id]`          | owner        | Rotate config, activate, deactivate         |
| `POST`   | `/api/admin/sso/verify-domain` | owner        | Run the DNS check                           |
| `PUT`    | `/api/admin/sso/verify-domain` | owner        | Reissue the challenge (dormant only)        |
| `DELETE` | `/api/admin/sso?id=`           | owner        | Deactivate, or `&hard=true` to remove       |

All mutating routes require a CSRF token and are rate limited. AGI API keys are
rejected on every route — these are session-authenticated administrative
operations only.

## Not implemented

- **SCIM directory sync** is a separate control and is not covered here.
- **Organization-scoped Clerk connections.** Because AGI does not use Clerk
  Organizations, connections are instance-level and matched by email domain.
  Adopting Clerk Organizations would let connections be scoped by
  `organizationId` and would make domain collisions across tenants impossible
  rather than merely prevented by the unique index and DNS verification.
- **`enforceSSO`** (refusing password sign-in for a domain once SSO is live) is
  accepted-but-rejected today by
  `apps/web/app/api/settings/organization/route.ts` and remains a separate
  decision.
