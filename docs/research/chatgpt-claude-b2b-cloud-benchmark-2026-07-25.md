# ChatGPT And Claude B2B Cloud Benchmark

**Status:** Dated research snapshot
**Owner:** Platform
**Research cutoff:** 2026-07-25 (America/Chicago)
**Scope:** Paid Cloud identity, subscription, connectors, administration, and
Team/Enterprise behavior that informs AGI's six application surfaces

This document is research, not current AGI product truth. Current AGI decisions remain in
`docs/current/`, and implemented behavior must be verified in production source and a
signed-in client before it is described as shipped.

## Evidence Policy

- **Official** means a current vendor help-center or product page.
- **Repository** means AGI production source inspected at this snapshot.
- **Inference** is an implementation conclusion derived from official behavior; it is not
  a claim about a competitor's private architecture.
- A feature visible on one competitor surface or plan is not assumed to exist on every
  surface or plan.
- This benchmark does not authorize copied branding, copy, assets, or proprietary code.

## Official Competitor Findings

### OpenAI

- Company Knowledge is documented for ChatGPT Business, Enterprise, and Edu. It uses
  connected company sources, returns citations, requires each user to authenticate where
  applicable, and is currently available on Web rather than the desktop or mobile apps.
  Business apps are enabled by default; Enterprise and Edu administrators enable and
  govern them.
- ChatGPT Business supports self-serve SAML or OIDC SSO. The Business SSO documentation
  explicitly says SCIM is not included; SCIM is an Enterprise capability.
- Enterprise administration includes workspace configuration, role-based access,
  identity provisioning, app controls, analytics, compliance, and security controls.
- App availability and actions are governed centrally. A client should not present an
  enabled connector merely because it can render its icon.

Official sources:

- [Company Knowledge in ChatGPT](https://help.openai.com/en/articles/12628342/)
- [SSO for ChatGPT Business](https://help.openai.com/en/articles/11489188)
- [SSO overview](https://help.openai.com/en/articles/10468051)
- [Admin controls for apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-in-connectors-enterprise-edu-and-team)
- [ChatGPT Enterprise](https://help.openai.com/en/articles/8265053)
- [Enterprise admin quickstart](https://help.openai.com/en/articles/20001264-chatgpt-enterprise-admin-quickstart)

### Anthropic

- Claude Team and Enterprise expose organization roles and administrator-controlled
  capabilities.
- Connectors can be added from a directory or as custom remote MCP integrations. Users
  authenticate to services individually when required.
- Enterprise custom roles can centrally allow or deny connectors, and that policy is
  documented as applying across Claude surfaces, including Web, desktop, mobile, Cowork,
  and Claude Code.
- Enterprise Search combines connected organization sources behind centrally managed
  access rather than treating a connector as a client-local toggle.

Official sources:

- [Roles and permissions](https://support.anthropic.com/en/articles/9267276-roles-and-permissions)
- [Use connectors with Claude](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
- [Enterprise custom roles](https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans)
- [Custom remote MCP integrations](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
- [Enterprise Search](https://support.claude.com/en/articles/12489464-use-enterprise-search)
- [Claude Enterprise](https://claude.com/solutions/enterprise)
- [SSO considerations](https://support.anthropic.com/en/articles/10276682-important-considerations-before-enabling-sso)

## Product Conclusions For AGI

These are AGI design conclusions, not claims about competitor internals.

1. **One cloud identity and entitlement contract.** All six clients must resolve the same
   signed-in account, canonical billing tier, model/tool entitlements, managed-usage state,
   and upgrade destination. Sign-out must clear privileged cached state.
2. **Server policy is authoritative.** A local menu, cached tier, or client platform must
   never grant models, tools, parallel work, connectors, or organization actions that the
   server denies.
3. **Web is the organization control plane.** Team membership, organization settings,
   billing, security, connector administration, and future SSO/SCIM belong on Web. Other
   clients need a clear, authenticated handoff to those controls and must reflect policy.
4. **Surface parity means workflow continuity, not identical menus.** Web, Mobile, and
   Desktop can share Cloud chat continuity. Chrome, VS Code, and CLI remain
   browser/workspace/task scoped, but paid identity, entitlement feedback, usage, and
   upgrade behavior must still be consistent.
5. **Connector truth beats catalog breadth.** A working connection needs a real
   authorization or token flow, durable ownership, server-side policy, revocation, error
   states, and tool execution. Unimplemented brands remain visibly unavailable.
6. **Enterprise labels require enterprise infrastructure.** SSO, SCIM, tenant isolation,
   directory synchronization, audit export, retention/legal hold, residency, and
   organization-wide connector policy cannot be represented as complete before their
   identity, schema, and enforcement paths exist.

## Cross-Surface Acceptance Matrix

| Contract                          | Web                     | Mobile                      | Desktop Cloud               | Chrome Cloud                              | VS Code Cloud                               | CLI Cloud                                   |
| --------------------------------- | ----------------------- | --------------------------- | --------------------------- | ----------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Device/account sign-in            | Native                  | Native                      | Native or Web handoff       | Web device handoff                        | Web device handoff                          | Web device handoff                          |
| Canonical tier hydration          | Required                | Required                    | Required                    | Required                                  | Required                                    | Required                                    |
| Sign-out clears entitlement cache | Required                | Required                    | Required                    | Required                                  | Required                                    | Required                                    |
| Auto/model entitlement            | Server enforced         | Server enforced             | Server enforced             | Server enforced                           | Server enforced                             | Server enforced                             |
| Managed usage and limit errors    | Full UI                 | Full UI                     | Full UI                     | Honest inline limit/upgrade state         | Full UI or Web handoff                      | Full UI or Web handoff                      |
| Billing/upgrade                   | Control plane           | App-store/Web-safe route    | Web handoff                 | Web handoff                               | Web handoff                                 | Web handoff                                 |
| Connector execution               | Supported integrations  | Only supported integrations | Only supported integrations | Browser-scoped plus supported Cloud tools | Workspace-scoped plus supported Cloud tools | Workspace-scoped plus supported Cloud tools |
| Team/Enterprise administration    | Canonical control plane | Authenticated Web handoff   | Authenticated Web handoff   | Authenticated Web handoff                 | Authenticated Web handoff                   | Authenticated Web handoff                   |
| Organization policy reflected     | Required                | Required                    | Required                    | Required                                  | Required                                    | Required                                    |

## Demo Gate

A surface is ready for a paid Cloud demo only when all of the following are reproducible:

1. Sign in, account identity, tier, and plan name load on first render.
2. Auto and the model picker expose only entitled choices.
3. A Cloud prompt completes, persists where that surface promises persistence, and renders
   files, images, code, citations, and artifacts that it claims to support.
4. Usage and limit states are accurate; upgrade opens the canonical purchase/control
   surface.
5. Every enabled connector has a real connection and execution path. Unavailable
   connectors say so before the user starts.
6. A Team/Enterprise user can reach the Web organization control plane, and non-admin
   users cannot perform administrator actions.
7. Sign-out removes account, tier, connector, and privileged action state.
8. Loading, empty, retry, cancellation, offline, and server-denied states are visible and
   truthful.

## Known Architectural Blockers At This Snapshot

The following must remain explicit until separately designed and verified:

- SAML/OIDC needs a selected identity implementation and a real IdP validation environment.
- SCIM endpoints and directory synchronization do not exist.
- Tenant-wide enforcement needs a canonical tenant identifier, backfill, ownership rules,
  and RLS changes across the affected schema.
- Organization-wide connector policy and deployment cannot be inferred from per-user
  connector records.
- Retention, legal hold, residency, organization deletion, and organization budgets depend
  on that tenant model.

Those blockers do not prevent an honest Team workspace and paid Cloud demo. They do
prevent calling the current product a completed Enterprise identity, provisioning, and
compliance platform.
